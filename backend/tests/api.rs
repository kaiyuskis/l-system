use axum::{
    Router,
    body::Body,
    http::Request,
};
use http_body_util::BodyExt;
use komorebi::{AppState, app, model::presets};
use serde_json::{Value, json};
use tower::ServiceExt;

fn router() -> Router {
    app(
        AppState::new(),
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
    let app = router();
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
    let app = router();
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
        .insert("host", "127.0.0.1:5173".parse().unwrap());
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
    assert!(r.status() == 404 || r.status() == 405);
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
