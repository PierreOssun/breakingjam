use std::net::{Ipv4Addr, SocketAddr};

use anyhow::Context;
use breakingjam::{config::Config, state::AppState};
use sqlx::PgPool;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Missing `.env` is fine: Docker and CI pass variables directly.
    dotenvy::dotenv().ok();
    breakingjam::init_tracing();

    let config = Config::from_env()?;
    let pool = PgPool::connect(&config.database_url)
        .await
        .context("cannot connect to DATABASE_URL")?;
    // Dev builds migrate on startup; release builds rely on `sqlx migrate run` in CI/deploy (§5).
    if cfg!(debug_assertions) {
        sqlx::migrate!().run(&pool).await?;
    }

    let addr = SocketAddr::from((Ipv4Addr::UNSPECIFIED, config.app_port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("cannot bind {addr}"))?;
    tracing::info!(%addr, "listening");

    let state = AppState::new(pool, config)?;
    axum::serve(listener, breakingjam::app(state)?)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received");
}
