//! Outgoing email: the code messages, and the sender posting them to the Worker's Email Service.

use oauth2::reqwest;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{config::Config, domain::user::CodePurpose};

/// Language of the emails the site sends; the frontend passes its own.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    /// English, also when the client says nothing.
    #[default]
    En,
    /// French.
    Fr,
    /// German.
    De,
}

/// One plain-text email, as the Worker's handler takes it.
#[derive(Debug, Serialize)]
pub struct Message {
    /// Recipient address.
    pub to: String,
    /// Subject line.
    pub subject: String,
    /// Plain-text body.
    pub text: String,
}

impl Message {
    /// The email carrying `code`, worded for `purpose` in `language`.
    pub fn code(purpose: CodePurpose, language: Language, to: &str, code: &str) -> Self {
        use CodePurpose::{ResetPassword, VerifyEmail};
        use Language::{De, En, Fr};
        // The code leads the subject, so phones offer to fill it in from the notification.
        let (subject, why, footer) = match language {
            En => (
                format!("{code} is your BreakingJam code"),
                match purpose {
                    VerifyEmail => "Welcome to BreakingJam! Enter this code to confirm your email:",
                    ResetPassword => "Enter this code to choose a new BreakingJam password:",
                },
                "The code works for 15 minutes. If you didn't ask for it, you can ignore this email.",
            ),
            Fr => (
                format!("{code} est votre code BreakingJam"),
                match purpose {
                    VerifyEmail => {
                        "Bienvenue sur BreakingJam ! Saisissez ce code pour confirmer votre adresse e-mail :"
                    }
                    ResetPassword => {
                        "Saisissez ce code pour choisir un nouveau mot de passe BreakingJam :"
                    }
                },
                "Le code est valable 15 minutes. Si vous ne l'avez pas demandé, ignorez cet e-mail.",
            ),
            De => (
                format!("{code} ist dein BreakingJam-Code"),
                match purpose {
                    VerifyEmail => {
                        "Willkommen bei BreakingJam! Gib diesen Code ein, um deine E-Mail-Adresse zu bestätigen:"
                    }
                    ResetPassword => {
                        "Gib diesen Code ein, um ein neues BreakingJam-Passwort zu wählen:"
                    }
                },
                "Der Code gilt 15 Minuten. Wenn du ihn nicht angefordert hast, ignoriere diese E-Mail.",
            ),
        };
        Self {
            to: to.to_owned(),
            subject,
            text: format!("{why}\n\n{code}\n\n{footer}\n"),
        }
    }
}

/// Sends emails: JSON posted to `MAIL_URL`, which in production is the Worker's handler in
/// front of Cloudflare Email Service.
#[derive(Debug, Clone)]
pub struct Mailer {
    http: reqwest::Client,
    url: String,
}

impl Mailer {
    /// The sender named by `config`, posting with `http`.
    pub fn new(http: reqwest::Client, config: &Config) -> Self {
        Self {
            http,
            url: config.mail_url.clone(),
        }
    }

    /// Hands `message` to the mail service.
    pub async fn send(&self, message: &Message) -> reqwest::Result<()> {
        self.http
            .post(&self.url)
            .json(message)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}
