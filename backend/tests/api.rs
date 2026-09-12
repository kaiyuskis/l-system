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

#[tokio::test]
async fn database_persists_library_and_draft_and_validates_writes() {
    let path = std::env::temp_dir().join(format!("komorebi-test-{}.sqlite3", std::process::id()));
    let p = presets()[0]["params"].clone();
    {
        let app = app(AppState::with_database(path.to_str().unwrap()).unwrap(), "../web/dist");
        let response = app.clone().oneshot(request("/api/library", json!({"name":"SQL ' tree", "data":p}))).await.unwrap();
        assert_eq!(response.status(), 200);
        let response = app.clone().oneshot(request("/api/draft", p.clone())).await.unwrap();
        assert_eq!(response.status(), 200);
        let response = app.clone().oneshot(request("/api/library", json!({"name":"", "data":p}))).await.unwrap();
        assert_eq!(response.status(), 400);
        let mut req = request("/api/library/delete", json!({"name":"SQL ' tree"}));
        req.headers_mut().insert("origin", "https://other.example".parse().unwrap());
        assert_eq!(app.oneshot(req).await.unwrap().status(), 403);
    }
    {
        let app = app(AppState::with_database(path.to_str().unwrap()).unwrap(), "../web/dist");
        let response = app.clone().oneshot(Request::get("/api/library").body(Body::empty()).unwrap()).await.unwrap();
        let saved = value(response).await;
        assert_eq!(saved[0]["name"], "SQL ' tree");
        let response = app.clone().oneshot(Request::get("/api/draft").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(value(response).await["seed"], p["seed"]);
        assert_eq!(app.clone().oneshot(request("/api/library/delete", json!({"name":"SQL ' tree"}))).await.unwrap().status(), 200);
        let response = app.oneshot(Request::get("/api/library").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(value(response).await, json!([]));
    }
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn fractional_native_generation_returns_distinct_geometry() {
    let app = router();
    let mut p = presets()[0]["params"].clone();
    let mut results = Vec::new();
    for age in [3.0, 3.25, 3.5] {
        p["generations"] = json!(age);
        let r = app.clone().oneshot(request("/api/tree/generate", p.clone())).await.unwrap();
        assert_eq!(r.status(), 200);
        let bytes = r.into_body().collect().await.unwrap().to_bytes();
        // Metadata includes generation timing; compare decoded generated geometry.
        let header = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
        results.push(bytes[8 + header..].to_vec());
    }
    assert_ne!(results[0], results[1]);
    assert_ne!(results[1], results[2]);
}
