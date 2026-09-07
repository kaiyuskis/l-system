pub mod ai;
pub mod engine;
pub mod mesh;
pub mod model;
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Request, State},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    convert::Infallible,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{Semaphore, mpsc};
use tower_http::{compression::CompressionLayer, services::ServeDir};

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    message: String,
}
impl ApiError {
    pub fn bad(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: message.into(),
        }
    }
    pub fn upstream(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_GATEWAY,
            message: message.into(),
        }
    }
    fn busy() -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            message: "別の処理が実行中です。少し待ってから再度お試しください。".into(),
        }
    }
    fn value(&self) -> Value {
        json!({"error":self.message,"code":self.status.as_u16()})
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.value())).into_response()
    }
}
type Cache = VecDeque<(String, Bytes)>;
#[derive(Clone)]
pub struct AppState {
    pub ai: ai::Ai,
    compute: Arc<Semaphore>,
    inference: Arc<Semaphore>,
    cache: Arc<Mutex<Cache>>,
}
impl AppState {
    pub fn new(ai: ai::Ai) -> Self {
        Self {
            ai,
            compute: Arc::new(Semaphore::new(2)),
            inference: Arc::new(Semaphore::new(1)),
            cache: Arc::new(Mutex::new(VecDeque::new())),
        }
    }
}
async fn boundaries(req: Request, next: Next) -> Response {
    if req.method() == axum::http::Method::POST {
        if let Some(origin) = req.headers().get(header::ORIGIN) {
            let valid = origin
                .to_str()
                .ok()
                .and_then(|o| reqwest::Url::parse(o).ok())
                .is_some_and(|url| {
                    let authority = match (url.host_str(), url.port()) {
                        (Some(host), Some(port)) => format!("{host}:{port}"),
                        (Some(host), None) => host.to_owned(),
                        _ => String::new(),
                    };
                    authority
                        == req
                            .headers()
                            .get(header::HOST)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("")
                        && ["http", "https"].contains(&url.scheme())
                });
            if !valid {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({"error":"このサイトからのリクエストは受け付けられません。"})),
                )
                    .into_response();
            }
        }
    }
    let mut response = next.run(req).await;
    response
        .headers_mut()
        .insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    if !response.headers().contains_key(header::CACHE_CONTROL) {
        response.headers_mut().insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
    }
    response
}
fn binary(bytes: Bytes, hit: bool) -> Response {
    (
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::CACHE_CONTROL, "no-store"),
            (
                header::HeaderName::from_static("x-geometry-cache"),
                if hit { "hit" } else { "miss" },
            ),
        ],
        bytes,
    )
        .into_response()
}
async fn generate_tree(
    State(state): State<AppState>,
    body: Result<Json<model::Plant>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    calculate(state, body, false).await
}
async fn export_tree(
    State(state): State<AppState>,
    body: Result<Json<model::Plant>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    calculate(state, body, true).await
}
async fn calculate(
    state: AppState,
    body: Result<Json<model::Plant>, axum::extract::rejection::JsonRejection>,
    full: bool,
) -> Result<Response, ApiError> {
    let Json(p) = body.map_err(|e| ApiError {
        status: e.status(),
        message: "樹木の設定を正しいJSON形式で送信してください。".into(),
    })?;
    p.validate().map_err(ApiError::bad)?;
    let mut key = serde_json::to_value(&p).unwrap();
    // Appearance never affects geometry: recoloring does not invalidate native results.
    for k in [
        "branchColor",
        "leafColor",
        "flowerColor",
        "budColor",
        "leafTextureKey",
        "initLength",
        "initThickness",
    ] {
        key.as_object_mut().unwrap().remove(k);
    }
    let key = format!("{full}:{key}");
    if let Some((_, bytes)) = state.cache.lock().unwrap().iter().find(|(k, _)| k == &key) {
        return Ok(binary(bytes.clone(), true));
    }
    let permit = state
        .compute
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::busy())?;
    let bytes = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let start = Instant::now();
        let (s, data, limit) = engine::generate(&p)?;
        Ok::<_, String>(Bytes::from(if full {
            mesh::encode(&s, &data, limit, start)
        } else {
            mesh::encode_preview(&s, &data, limit, start)
        }))
    })
    .await
    .map_err(|_| ApiError::upstream("計算を完了できませんでした。"))?
    .map_err(ApiError::bad)?;
    {
        let mut cache = state.cache.lock().unwrap();
        while cache.len() >= 4
            || cache.iter().map(|(_, b)| b.len()).sum::<usize>() + bytes.len() > 64 * 1024 * 1024
        {
            if cache.pop_front().is_none() {
                break;
            }
        }
        if bytes.len() <= 64 * 1024 * 1024 {
            cache.push_back((key, bytes.clone()));
        }
    }
    Ok(binary(bytes, false))
}
async fn status(State(state): State<AppState>) -> Json<Value> {
    Json(tokio::time::timeout(Duration::from_secs(5),state.ai.status()).await.unwrap_or_else(|_|json!({"available":false,"model":state.ai.model,"message":"Ollamaの接続確認がタイムアウトしました。"})))
}
async fn generate_ai(
    State(state): State<AppState>,
    body: Result<Json<ai::Input>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(input) = body.map_err(|e| ApiError {
        status: e.status(),
        message: "指示と現在の設定をJSONで送信してください。".into(),
    })?;
    ai::validate_input(&input)?;
    let permit = state
        .inference
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::busy())?;
    let (tx, rx) = mpsc::channel::<Result<Bytes, Infallible>>(2);
    // Whitespace is valid before JSON. Streaming it lets Hyper observe disconnects
    // immediately, so cancelling the browser aborts the upstream Ollama future.
    tokio::spawn(async move {
        let _permit = permit;
        let work = tokio::time::timeout(state.ai.timeout, state.ai.generate(input));
        tokio::pin!(work);
        let mut heartbeat = tokio::time::interval(Duration::from_secs(2));
        loop {
            tokio::select! {
                _=tx.closed()=>break,
                _=heartbeat.tick()=>{if tx.send(Ok(Bytes::from_static(b"\n"))).await.is_err(){break;}},
                result=&mut work=>{let value=match result {Ok(Ok(v))=>v,Ok(Err(e))=>e.value(),Err(_)=>json!({"error":"AIの応答がタイムアウトしました。","code":504})};let _=tx.send(Ok(Bytes::from(value.to_string()))).await;break;}
            }
        }
    });
    Ok((
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx)),
    )
        .into_response())
}
pub fn app(state: AppState, static_dir: &str) -> Router {
    Router::new()
        .route(
            "/api/health",
            get(|| async { Json(json!({"ok":true,"engine":"rust","protocol":2})) }),
        )
        .route("/api/tree/generate", post(generate_tree))
        .route("/api/tree/export", post(export_tree))
        .route("/api/ai/status", get(status))
        .route("/api/ai/generate", post(generate_ai))
        .fallback_service(ServeDir::new(static_dir))
        .layer(DefaultBodyLimit::max(131072))
        .layer(CompressionLayer::new())
        .layer(middleware::from_fn(boundaries))
        .with_state(state)
}
