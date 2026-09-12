//! SQLite-backed shared library and draft. All SQL runs off the async executor.
use axum::{extract::State, Json};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use crate::{ApiError, AppState, model::Plant};

pub fn open(path: &str) -> rusqlite::Result<Connection> {
    let db = Connection::open(path)?;
    db.busy_timeout(std::time::Duration::from_secs(5))?;
    db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS specimens (name TEXT PRIMARY KEY, data TEXT NOT NULL, saved_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS draft (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);")?;
    crate::projects::migrate(&db)?;
    Ok(db)
}
async fn run<T: Send + 'static>(state: AppState, operation: impl FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static) -> Result<Json<T>, ApiError> {
    tokio::task::spawn_blocking(move || {
        let db = state.db.lock().map_err(|_| ApiError::unavailable("保存先を利用できません。"))?;
        operation(&db).map(Json).map_err(|e| { eprintln!("Database: {e}"); ApiError::unavailable("データベースにアクセスできません。再試行してください。") })
    }).await.map_err(|_| ApiError::unavailable("保存処理を完了できません。"))?
}
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Value>>, ApiError> {
    run(state, |db| {
        let mut query = db.prepare("SELECT name, data, saved_at FROM specimens ORDER BY saved_at DESC, name")?;
        query.query_map([], |row| {
            let raw: String = row.get(1)?;
            let data: Value = serde_json::from_str(&raw).map_err(|e| rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(e)))?;
            Ok(json!({"name":row.get::<_,String>(0)?,"data":data,"savedAt":row.get::<_,i64>(2)?}))
        })?.collect()
    }).await
}
#[derive(Deserialize)]
pub struct Save { name: String, data: Plant }
#[derive(Deserialize)]
pub struct Name { name: String }
fn name(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_owned();
    if value.is_empty() || value.chars().count() > 80 || value.chars().any(char::is_control) { return Err(ApiError::bad("保存名は改行を含まない1〜80文字で入力してください。")); }
    Ok(value)
}
pub async fn save(State(state): State<AppState>, Json(body): Json<Save>) -> Result<Json<Value>, ApiError> {
    let name = name(body.name)?;
    body.data.validate().map_err(ApiError::bad)?;
    let raw = serde_json::to_string(&body.data).unwrap();
    run(state, move |db| {
        db.execute("INSERT INTO specimens(name,data,saved_at) VALUES(?1,?2,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(name) DO UPDATE SET data=excluded.data,saved_at=excluded.saved_at", params![name,raw])?;
        Ok(json!({"ok":true}))
    }).await
}
pub async fn delete(State(state): State<AppState>, Json(body): Json<Name>) -> Result<Json<Value>, ApiError> {
    let name = name(body.name)?;
    run(state, move |db| { db.execute("DELETE FROM specimens WHERE name=?1", [name])?; Ok(json!({"ok":true})) }).await
}
pub async fn load_draft(State(state): State<AppState>) -> Result<Json<Option<Value>>, ApiError> {
    run(state, |db| {
        let raw: Option<String> = db.query_row("SELECT data FROM draft WHERE id=1", [], |row| row.get(0)).optional()?;
        raw.map(|raw| serde_json::from_str(&raw).map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e)))).transpose()
    }).await
}
pub async fn save_draft(State(state): State<AppState>, Json(data): Json<Plant>) -> Result<Json<Value>, ApiError> {
    data.validate().map_err(ApiError::bad)?;
    let raw = serde_json::to_string(&data).unwrap();
    run(state, move |db| { db.execute("INSERT INTO draft(id,data) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data", [raw])?; Ok(json!({"ok":true})) }).await
}
