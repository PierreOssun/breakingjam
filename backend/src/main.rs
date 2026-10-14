use std::net::{Ipv4Addr, SocketAddr};

use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    // Missing `.env` is fine: Docker and CI pass variables directly.
    dotenvy::dotenv().ok();
    init_tracing();

    // Full `Config::from_env()` arrives in milestone 3; only the port is needed for now.
    let port = match std::env::var("APP_PORT") {
        Ok(v) => v
            .parse::<u16>()
            .expect("APP_PORT must be a valid port number"),
        Err(_) => 8080,
    };
    let addr = SocketAddr::from((Ipv4Addr::UNSPECIFIED, port));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind listener");
    tracing::info!(%addr, "listening");

    axum::serve(listener, breakingjam::app())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

/// Pretty logs in dev, JSON when `LOG_FORMAT=json` (prod).
fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("breakingjam=debug,tower_http=info"));
    let json = std::env::var("LOG_FORMAT").as_deref() == Ok("json");
    tracing_subscriber::registry()
        .with(filter)
        .with(json.then(|| tracing_subscriber::fmt::layer().json()))
        .with((!json).then(|| tracing_subscriber::fmt::layer().pretty()))
        .init();
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
