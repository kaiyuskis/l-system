use komorebi::{AppState, app};
use std::{env, time::Duration};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if env::args().any(|a| a == "--healthcheck") {
        reqwest::Client::new()
            .get(format!(
                "http://127.0.0.1:{}/api/health",
                env::var("PORT").unwrap_or("5173".into())
            ))
            .timeout(Duration::from_secs(3))
            .send()
            .await?
            .error_for_status()?;
        return Ok(());
    }
    let host = env::var("HOST").unwrap_or("127.0.0.1".into());
    let port = env::var("PORT").unwrap_or("5173".into()).parse::<u16>()?;
    if port == 0 {
        return Err("PORT must be between 1 and 65535".into());
    }
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    println!("Komorebi Rust: http://{host}:{port}");
    axum::serve(
        listener,
        app(
            AppState::new(),
            &env::var("STATIC_DIR").unwrap_or("web/dist".into()),
        ),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}
