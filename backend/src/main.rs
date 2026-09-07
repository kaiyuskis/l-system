use komorebi::{AppState, ai::Ai, app};
use std::{env, time::Duration};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if env::args().any(|a| a == "--healthcheck") {
        reqwest::Client::new()
            .get(format!(
                "http://127.0.0.1:{}/api/health",
                env::var("PORT").unwrap_or("3000".into())
            ))
            .timeout(Duration::from_secs(3))
            .send()
            .await?
            .error_for_status()?;
        return Ok(());
    }
    let host = env::var("HOST").unwrap_or("127.0.0.1".into());
    let port = env::var("PORT").unwrap_or("3000".into()).parse::<u16>()?;
    if port == 0 {
        return Err("PORT must be between 1 and 65535".into());
    }
    let timeout = env::var("AI_TIMEOUT_MS")
        .unwrap_or("180000".into())
        .parse::<u64>()?;
    if !(1000..=600000).contains(&timeout) {
        return Err("AI_TIMEOUT_MS must be 1000..600000".into());
    }
    let ai = Ai::new(
        &env::var("OLLAMA_BASE_URL").unwrap_or("http://127.0.0.1:11434".into()),
        env::var("OLLAMA_MODEL").unwrap_or("gemma4:latest".into()),
        Duration::from_millis(timeout),
    )?;
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    println!("Komorebi Rust: http://{host}:{port} (model: {})", ai.model);
    axum::serve(
        listener,
        app(
            AppState::new(ai),
            &env::var("STATIC_DIR").unwrap_or("web/dist".into()),
        ),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}
