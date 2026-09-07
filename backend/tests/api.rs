use axum::{
    Json, Router,
    body::{Body, Bytes},
    http::{Request, StatusCode},
    routing::post,
};
use http_body_util::BodyExt;
use komorebi::{AppState, ai::Ai, app, model::presets};
use serde_json::{Value, json};
use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tower::ServiceExt;

fn router(base: &str, timeout: Duration) -> Router {
    app(
        AppState::new(Ai::new(base, "test:model".into(), timeout).unwrap()),
        "../web/dist",
    )
}
fn request(path: &str, value: Value) -> Request<Body> {
    Request::post(path)
        .header("content-type", "application/json")
        .body(Body::from(value.to_string()))
        .unwrap()
}
async fn value(response: axum::response::Response) -> Value {
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}
#[tokio::test]
async fn health_and_geometry_cache_reuse() {
    let app = router("http://127.0.0.1:1", Duration::from_secs(1));
    let r = app
        .clone()
        .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(value(r).await["engine"], "rust");
    let p = presets()[0]["params"].clone();
    let r = app
        .clone()
        .oneshot(request("/api/tree/generate", p.clone()))
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    assert_eq!(r.headers()["x-geometry-cache"], "miss");
    let bytes = r.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[..4], b"KMR2");
    let mut changed = p;
    changed["leafColor"] = json!("#ff0000");
    let r = app
        .oneshot(request("/api/tree/generate", changed))
        .await
        .unwrap();
    assert_eq!(r.headers()["x-geometry-cache"], "hit");
    assert_eq!(bytes, r.into_body().collect().await.unwrap().to_bytes());
}
#[tokio::test]
async fn invalid_requests_are_rejected_before_computation() {
    let app = router("http://127.0.0.1:1", Duration::from_secs(1));
    let r = app
        .clone()
        .oneshot(request("/api/tree/generate", json!({})))
        .await
        .unwrap();
    assert!(r.status().is_client_error());
    let mut req = request("/api/tree/generate", presets()[0]["params"].clone());
    req.headers_mut()
        .insert("origin", "https://other.example".parse().unwrap());
    req.headers_mut()
        .insert("host", "127.0.0.1:3000".parse().unwrap());
    assert_eq!(app.clone().oneshot(req).await.unwrap().status(), 403);
    let r = app
        .clone()
        .oneshot(request(
            "/api/tree/generate",
            json!({"padding":"x".repeat(140000)}),
        ))
        .await
        .unwrap();
    assert_eq!(r.status(), 413);
    let r = app
        .clone()
        .oneshot(request("/api/ai/generate", json!({"prompt":""})))
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let r = app
        .oneshot(
            Request::post("/api/tree/generate")
                .header("content-type", "application/jsonp")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r.status(), 415);
}
async fn serve(router: Router) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let handle = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    (base, handle)
}
#[tokio::test]
async fn ai_calls_ollama_with_schema_and_repairs_invalid_output_once() {
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let mock=Router::new().route("/api/chat",post(move |Json(body):Json<Value>| {let count=count.clone();async move{
        assert_eq!(body["think"],false);assert_eq!(body["stream"],false);assert_eq!(body["format"]["type"],"object");
        let n=count.fetch_add(1,Ordering::SeqCst);let content=if n==0 {"not json".into()} else {json!({"name":"桜","description":"淡い桜","preset":"sakura","settings":{"generations":3}}).to_string()};Json(json!({"message":{"content":content}}))
    }}));
    let (base, server) = serve(mock).await;
    let response = router(&base, Duration::from_secs(3))
        .oneshot(request("/api/ai/generate", json!({"prompt":"桜"})))
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let result = value(response).await;
    assert_eq!(result["name"], "桜");
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    server.abort();
}
#[tokio::test]
async fn ai_timeout_has_actionable_json_error() {
    let (base, server) = serve(Router::new().route(
        "/api/chat",
        post(|| async {
            tokio::time::sleep(Duration::from_secs(3)).await;
            Json(json!({}))
        }),
    ))
    .await;
    let response = router(&base, Duration::from_millis(30))
        .oneshot(request("/api/ai/generate", json!({"prompt":"桜"})))
        .await
        .unwrap();
    assert_eq!(value(response).await["code"], 504);
    server.abort();
}
#[tokio::test]
async fn dropping_ai_response_cancels_inference_and_releases_slot() {
    let (base, mock) = serve(Router::new().route(
        "/api/chat",
        post(|| async {
            tokio::time::sleep(Duration::from_secs(30)).await;
            Json(json!({}))
        }),
    ))
    .await;
    let app = router(&base, Duration::from_secs(60));
    let first = app
        .clone()
        .oneshot(request("/api/ai/generate", json!({"prompt":"桜"})))
        .await
        .unwrap();
    assert_eq!(
        app.clone()
            .oneshot(request("/api/ai/generate", json!({"prompt":"桜"})))
            .await
            .unwrap()
            .status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    drop(first); // equivalent to Hyper dropping the streaming body on disconnect
    tokio::time::sleep(Duration::from_millis(30)).await;
    let second = app
        .oneshot(request("/api/ai/generate", json!({"prompt":"桜"})))
        .await
        .unwrap();
    assert_eq!(second.status(), 200);
    drop(second);
    mock.abort();
}
#[tokio::test]
async fn bad_ollama_response_and_missing_model_return_errors() {
    let (base, mock) = serve(Router::new().route(
        "/api/chat",
        post(|| async { (StatusCode::NOT_FOUND, Bytes::new()) }),
    ))
    .await;
    let response = router(&base, Duration::from_secs(1))
        .oneshot(request("/api/ai/generate", json!({"prompt":"桜"})))
        .await
        .unwrap();
    assert_eq!(value(response).await["code"], 503);
    mock.abort();
}
