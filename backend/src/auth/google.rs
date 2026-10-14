//! Google sign-in: authorization-code flow with PKCE (§5 Auth).

use axum::http::{HeaderMap, HeaderValue};
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, EndpointNotSet, EndpointSet,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope, TokenResponse, TokenUrl,
    basic::BasicClient, reqwest, url::form_urlencoded,
};
use serde::Deserialize;
use sqlx::PgPool;

use crate::{config::Config, db, domain::user::User, error::AppError};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const COOKIE: &str = "bj_oauth";
const COOKIE_TTL_SECONDS: u32 = 10 * 60;

type GoogleClient =
    BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>;

/// What Google tells us about the person who signed in.
#[derive(Debug, Deserialize)]
pub struct Profile {
    /// Google's stable account id.
    pub sub: String,
    /// Account email as Google reports it.
    pub email: String,
    /// Whether Google vouches for the email; missing means no.
    #[serde(default)]
    pub email_verified: bool,
    /// Full name, when shared.
    pub name: Option<String>,
}

/// Flow state kept in a short-lived cookie between the redirect and the callback.
pub struct Pending {
    /// CSRF token Google must echo back.
    pub state: String,
    /// PKCE verifier for the code exchange.
    pub verifier: String,
    /// Path to land on afterwards, not yet re-checked.
    pub next: String,
}

fn client(config: &Config) -> Result<GoogleClient, AppError> {
    let url_error = |err: oauth2::url::ParseError| AppError::Internal(err.into());
    Ok(
        BasicClient::new(ClientId::new(config.google_client_id.clone()))
            .set_client_secret(ClientSecret::new(config.google_client_secret.clone()))
            .set_auth_uri(AuthUrl::new(AUTH_URL.into()).map_err(url_error)?)
            .set_token_uri(TokenUrl::new(TOKEN_URL.into()).map_err(url_error)?)
            .set_redirect_uri(
                RedirectUrl::new(config.google_redirect_url.clone()).map_err(url_error)?,
            ),
    )
}

/// The Google consent URL and the `Set-Cookie` value that remembers the flow.
pub fn authorize(config: &Config, next: &str) -> Result<(String, HeaderValue), AppError> {
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (url, state) = client(config)?
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".into()))
        .add_scope(Scope::new("email".into()))
        .add_scope(Scope::new("profile".into()))
        .set_pkce_challenge(challenge)
        .url();
    // state and verifier are base64url (no '.'), so '.' can separate the three parts.
    let next: String = form_urlencoded::byte_serialize(next.as_bytes()).collect();
    let value = format!("{}.{}.{next}", state.secret(), verifier.secret());
    let cookie = super::cookie(COOKIE, &value, COOKIE_TTL_SECONDS, config.secure_cookies())?;
    Ok((url.into(), cookie))
}

/// Reads the flow cookie back; `None` when missing or malformed.
pub fn pending(headers: &HeaderMap) -> Option<Pending> {
    let mut parts = super::read_cookie(headers, COOKIE)?.splitn(3, '.');
    let state = parts.next()?.to_owned();
    let verifier = parts.next()?.to_owned();
    let next = form_urlencoded::parse(format!("n={}", parts.next()?).as_bytes())
        .next()?
        .1
        .into_owned();
    Some(Pending {
        state,
        verifier,
        next,
    })
}

/// `Set-Cookie` value that deletes the flow cookie.
pub fn clear(config: &Config) -> Result<HeaderValue, AppError> {
    super::cookie(COOKIE, "", 0, config.secure_cookies())
}

/// Trades the authorization code for the user's Google profile.
pub async fn exchange(
    config: &Config,
    http: &reqwest::Client,
    code: String,
    verifier: String,
) -> Result<Profile, AppError> {
    let token = client(config)?
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(PkceCodeVerifier::new(verifier))
        .request_async(http)
        .await
        .map_err(|err| AppError::Internal(anyhow::anyhow!("google token exchange: {err}")))?;
    let body = http
        .get(USERINFO_URL)
        .bearer_auth(token.access_token().secret())
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|err| AppError::Internal(err.into()))?
        .bytes()
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    serde_json::from_slice(&body).map_err(|err| AppError::Internal(err.into()))
}

/// Finds the account for a Google profile: by subject id, then by verified email, else creates one.
pub async fn find_or_create_user(pool: &PgPool, profile: &Profile) -> Result<User, AppError> {
    let mut tx = pool.begin().await?;
    if let Some(user) = db::users::find_by_google_sub(&mut tx, &profile.sub).await? {
        return Ok(user);
    }

    let existing = if profile.email_verified {
        db::users::find_by_email_for_update(&mut tx, &profile.email).await?
    } else {
        None
    };
    let user = match existing {
        Some((user, email_was_verified)) => {
            db::users::link_google(&mut tx, user.id, &profile.sub).await?;
            if !email_was_verified {
                // Whoever registered the unverified address may hold a live session.
                db::sessions::delete_for_user(&mut tx, user.id).await?;
            }
            user
        }
        None => {
            let name = profile
                .name
                .as_deref()
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| profile.email.split('@').next().unwrap_or_default());
            db::users::insert_with_google(&mut tx, profile, name).await?
        }
    };
    tx.commit().await?;
    Ok(user)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::header;

    fn config() -> Config {
        Config::from_lookup(|name| match name {
            "APP_PORT" => None,
            "GOOGLE_REDIRECT_URL" => Some("http://localhost:8080/api/auth/google/callback".into()),
            _ => Some(format!("test-{name}")),
        })
        .unwrap()
    }

    #[test]
    fn authorize_round_trips_through_the_cookie() {
        let (url, cookie) = authorize(&config(), "/org/jams/new?step=2").unwrap();
        assert!(url.starts_with(AUTH_URL));
        assert!(url.contains("code_challenge_method=S256"));

        let set_cookie = cookie.to_str().unwrap();
        let value = set_cookie.split(';').next().unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, HeaderValue::from_str(value).unwrap());

        let pending = pending(&headers).unwrap();
        assert_eq!(pending.next, "/org/jams/new?step=2");
        assert!(url.contains(&format!("state={}", pending.state)));
    }
}
