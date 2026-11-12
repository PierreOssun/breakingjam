//! M31: the super admin and the admins manage the team; the Accounts tab.
mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{TestResponse, app, get, id_of, post, publish, put, send, set_role, sign_up};

struct World {
    app: Router,
    pool: PgPool,
    super_admin: String,
    admin: String,
}

async fn world(pool: PgPool) -> World {
    let app = app(pool.clone());
    let super_admin = sign_up(&app, &pool, "super@example.com").await;
    set_role(&pool, "super@example.com", "super_admin").await;
    let admin = sign_up(&app, &pool, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    World {
        app,
        pool,
        super_admin,
        admin,
    }
}

impl World {
    async fn id(&self, email: &str) -> String {
        sqlx::query_scalar!(
            "select id::text as \"id!\" from app_users where email = $1::text::citext",
            email
        )
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }

    /// Gives `email` the team role `role` (`none`, `seed_admin`, `admin`) as `cookie`.
    async fn set(&self, email: &str, role: &str, cookie: &str) -> TestResponse {
        let uri = format!("/api/admin/users/{}/role", self.id(email).await);
        send(&self.app, put(&uri, json!({ "role": role }), Some(cookie))).await
    }

    async fn accounts(&self, query: &str) -> Vec<Value> {
        let uri = format!("/api/admin/accounts?{query}");
        let page = send(&self.app, get(&uri, Some(&self.admin))).await;
        assert_eq!(page.status, StatusCode::OK);
        page.json["items"].as_array().unwrap().clone()
    }

    /// The organiser card of a public jam; null for the team's.
    async fn organizer_of(&self, jam: &str) -> Value {
        let page = send(&self.app, get(&format!("/api/events/{jam}"), None)).await;
        page.json["organizer"].clone()
    }

    /// A draft by `cookie`; returns its id.
    async fn draft(&self, cookie: &str) -> String {
        let body = json!({ "name": "Jam", "starts_on": "2030-06-01", "ends_on": "2030-06-01",
                           "timezone": "Europe/Paris", "city": "Paris", "country": "FR" });
        id_of(&send(&self.app, post("/api/events", body, Some(cookie))).await)
    }
}

fn emails(rows: &[Value]) -> Vec<&str> {
    rows.iter().map(|r| r["email"].as_str().unwrap()).collect()
}

#[sqlx::test]
async fn the_super_admin_manages_admins_and_admins_manage_seed_admins(pool: PgPool) {
    let w = world(pool).await;
    sign_up(&w.app, &w.pool, "user@example.com").await;
    sign_up(&w.app, &w.pool, "other@example.com").await;
    set_role(&w.pool, "other@example.com", "admin").await;

    let seed = w.set("user@example.com", "seed_admin", &w.admin).await;
    assert_eq!(seed.status, StatusCode::OK);
    assert_eq!(seed.json["role"], "seed_admin");
    for (email, role) in [
        ("user@example.com", "admin"),
        ("other@example.com", "none"),
        ("super@example.com", "none"),
    ] {
        let refused = w.set(email, role, &w.admin).await;
        assert_eq!(refused.status, StatusCode::FORBIDDEN, "{email} → {role}");
    }

    let promoted = w.set("user@example.com", "admin", &w.super_admin).await;
    assert_eq!(promoted.json["role"], "admin");
    let removed = w.set("other@example.com", "none", &w.super_admin).await;
    assert_eq!(removed.json["role"], "user");
    let own = w.set("super@example.com", "none", &w.super_admin).await;
    assert_eq!(own.status, StatusCode::UNPROCESSABLE_ENTITY);

    let logged = sqlx::query_scalar!(
        r#"select count(*) as "n!" from admin_actions where action = 'role_changed'"#
    )
    .fetch_one(&w.pool)
    .await
    .unwrap();
    assert_eq!(logged, 3);
}

#[sqlx::test]
async fn there_is_one_super_admin_at_most(pool: PgPool) {
    let w = world(pool).await;
    let second =
        sqlx::query!("update app_users set role = 'super_admin' where email = 'admin@example.com'")
            .execute(&w.pool)
            .await;
    assert!(second.is_err());
}

#[sqlx::test]
async fn the_team_s_jams_stay_the_team_s_when_their_enterer_leaves(pool: PgPool) {
    let w = world(pool).await;
    // An organiser with a jam of their own joins the team, then enters one for it.
    let member = sign_up(&w.app, &w.pool, "member@example.com").await;
    let own = w.draft(&member).await;
    set_role(&w.pool, "member@example.com", "seed_admin").await;
    let team = w.draft(&member).await;
    publish(&w.pool, &own).await;
    publish(&w.pool, &team).await;
    assert_eq!(w.organizer_of(&team).await, Value::Null);
    assert_eq!(w.organizer_of(&own).await["jams"], 1);

    let removed = w.set("member@example.com", "none", &w.admin).await;
    assert_eq!(removed.json["role"], "organizer");

    assert_eq!(w.organizer_of(&team).await, Value::Null);
    let owners = sqlx::query!(
        "select id::text as \"id!\", organizer_id::text as \"owner!\" from events order by created_at"
    )
    .fetch_all(&w.pool)
    .await
    .unwrap();
    let owner = |jam: &str| owners.iter().find(|r| r.id == jam).unwrap().owner.clone();
    assert_eq!(owner(&own), w.id("member@example.com").await);
    assert_eq!(owner(&team), w.id("admin@example.com").await);
}

#[sqlx::test]
async fn the_accounts_tab_lists_each_view(pool: PgPool) {
    let w = world(pool).await;
    let organizer = sign_up(&w.app, &w.pool, "org@example.com").await;
    w.draft(&organizer).await;
    let member = sign_up(&w.app, &w.pool, "member@example.com").await;
    set_role(&w.pool, "member@example.com", "seed_admin").await;
    w.draft(&member).await;
    let body =
        json!({ "email": "new@example.com", "password": "correct horse", "display_name": "New" });
    let registered = send(&w.app, post("/api/auth/register", body, None)).await;
    assert_eq!(registered.status, StatusCode::ACCEPTED);

    // Each sign-up logged in, the newest last; the unconfirmed account never did.
    let seen = w.accounts("view=last_seen").await;
    assert_eq!(
        emails(&seen),
        [
            "member@example.com",
            "org@example.com",
            "admin@example.com",
            "super@example.com"
        ]
    );
    assert!(seen[0]["last_seen_at"].is_string());
    assert_eq!(emails(&w.accounts("view=new").await).len(), 4);
    assert_eq!(
        emails(&w.accounts("view=unconfirmed").await),
        ["new@example.com"]
    );

    // The team's jams are nobody's own.
    let organizers = w.accounts("view=organizers").await;
    assert_eq!(emails(&organizers), ["org@example.com"]);
    assert_eq!(organizers[0]["private_jams"], 1);
    assert_eq!(organizers[0]["public_jams"], 0);

    assert_eq!(
        emails(&w.accounts("view=team").await),
        [
            "member@example.com",
            "admin@example.com",
            "super@example.com"
        ]
    );
    assert_eq!(emails(&w.accounts("q=ORG@").await), ["org@example.com"]);
    // What the viewing admin may change: seed admins only, and not their own role.
    let team = w.accounts("view=team").await;
    assert_eq!(team[0]["team_roles"], json!(["none", "seed_admin"]));
    assert_eq!(team[1]["team_roles"], json!([]));
    assert_eq!(team[2]["team_roles"], json!([]));
    assert_eq!(w.accounts("q=%25").await, Vec::<Value>::new());
}

#[sqlx::test]
async fn coming_back_counts_as_seen(pool: PgPool) {
    let w = world(pool).await;
    sqlx::query!("update app_users set last_seen_at = null")
        .execute(&w.pool)
        .await
        .unwrap();
    send(&w.app, get("/api/auth/me", Some(&w.super_admin))).await;
    assert_eq!(
        emails(&w.accounts("view=last_seen").await),
        ["super@example.com"]
    );
}
