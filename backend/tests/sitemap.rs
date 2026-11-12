mod test_app;

use axum::http::{StatusCode, header::CONTENT_TYPE};
use serde_json::json;
use sqlx::PgPool;
use test_app::{app, get, id_of, post, publish, send, set_role, sign_up};

#[sqlx::test]
async fn sitemap_lists_public_pages_only(pool: PgPool) {
    let app = app(pool.clone());
    let organizer = sign_up(&app, &pool, "org@example.com").await;
    let jam = async |name: &str| {
        let body = json!({ "name": name, "starts_on": "2030-06-01", "ends_on": "2030-06-01",
                           "timezone": "Europe/Paris", "city": "Paris", "country": "FR" });
        id_of(&send(&app, post("/api/events", body, Some(&organizer))).await)
    };
    let public = jam("Été Cypher").await;
    publish(&pool, &public).await;
    jam("Secret Draft").await;
    let dancer = |name: &str| json!({ "dancer_name": name, "country": "FR" });
    let kept = id_of(
        &send(
            &app,
            post("/api/dancers", dancer("Lil G"), Some(&organizer)),
        )
        .await,
    );
    let merged = id_of(
        &send(
            &app,
            post("/api/dancers", dancer("Lil G2"), Some(&organizer)),
        )
        .await,
    );
    sqlx::query!(
        "update dancers set merged_into_id = $1::text::uuid where id = $2::text::uuid",
        kept,
        merged
    )
    .execute(&pool)
    .await
    .unwrap();
    // The team's account owns imported jams but runs none of them: no organiser page listed.
    let team = sign_up(&app, &pool, "team@example.com").await;
    set_role(&pool, "team@example.com", "seed_admin").await;
    let body = json!({ "name": "Imported", "starts_on": "2030-07-01", "ends_on": "2030-07-01",
                       "timezone": "Europe/Paris", "city": "Lyon", "country": "FR" });
    let imported = id_of(&send(&app, post("/api/events", body, Some(&team))).await);
    publish(&pool, &imported).await;

    let sitemap = send(&app, get("/api/sitemap.xml", None)).await;
    assert_eq!(sitemap.status, StatusCode::OK);
    assert_eq!(
        sitemap.headers[CONTENT_TYPE],
        "application/xml; charset=utf-8"
    );
    let xml = String::from_utf8(sitemap.bytes).unwrap();
    let base = "test-APP_BASE_URL";
    assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset"));
    assert!(xml.contains(&format!("<url><loc>{base}</loc></url>")));
    assert!(xml.contains(&format!("<url><loc>{base}/privacy</loc></url>")));
    let slug: String =
        sqlx::query_scalar!("select slug from events where id = $1::text::uuid", public)
            .fetch_one(&pool)
            .await
            .unwrap();
    let suffix = slug.strip_prefix("été-cypher-").unwrap();
    // Non-ASCII letters of a slug are percent-encoded, as the protocol asks.
    let loc = format!("<loc>{base}/jams/%C3%A9t%C3%A9-cypher-{suffix}</loc><lastmod>");
    assert!(xml.contains(&loc), "{xml}");
    assert!(xml.contains("imported-"));
    assert!(!xml.contains("secret-draft"));
    assert!(xml.contains(&format!("{base}/dancers/{kept}</loc><lastmod>")));
    assert!(!xml.contains(&merged));
    let organizer_id: String = sqlx::query_scalar!(
        "select id::text as \"id!\" from app_users where email = 'org@example.com'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(xml.contains(&format!(
        "<url><loc>{base}/organizers/{organizer_id}</loc></url>"
    )));
    let team_id: String = sqlx::query_scalar!(
        "select id::text as \"id!\" from app_users where email = 'team@example.com'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!xml.contains(&team_id));

    // An organiser set back to `user` keeps their jams but has no page any more.
    set_role(&pool, "org@example.com", "user").await;
    let xml = String::from_utf8(send(&app, get("/api/sitemap.xml", None)).await.bytes).unwrap();
    assert!(!xml.contains(&organizer_id));
    assert!(xml.contains(&loc));
    assert!(xml.ends_with("</urlset>\n"));
}
