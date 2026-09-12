//! Versioned projects. Every mutation checks the version inside a transaction.
use axum::{extract::{Path, State}, Json};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use crate::{AppState, ApiError, model::Plant};

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, thumbnail TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, saved_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS project_history(project_id TEXT NOT NULL, revision INTEGER NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, thumbnail TEXT NOT NULL, deleted INTEGER NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(project_id,revision));
    INSERT OR IGNORE INTO projects SELECT 'legacy-'||hex(name),name,data,'',1,0,saved_at FROM specimens;
    INSERT OR IGNORE INTO projects SELECT 'legacy-draft','以前の作業',data,'',1,0,CAST(strftime('%s','now') AS INTEGER)*1000 FROM draft;
    INSERT OR IGNORE INTO project_history SELECT id,revision,name,data,thumbnail,deleted,saved_at FROM projects;")
}
fn error(status: axum::http::StatusCode, message: &str) -> ApiError { ApiError { status, message: message.into() } }
fn db_error(e: rusqlite::Error) -> ApiError { eprintln!("Database: {e}"); ApiError::unavailable("保存先にアクセスできません。再試行してください。") }
async fn run<T: Send + 'static>(state: AppState, action: impl FnOnce(&Connection)->Result<T,ApiError> + Send + 'static) -> Result<Json<T>,ApiError> {
    tokio::task::spawn_blocking(move || { let db=state.db.lock().map_err(|_| ApiError::unavailable("保存先を利用できません。"))?; action(&db).map(Json) }).await.map_err(|_| ApiError::unavailable("保存処理が中断されました。"))?
}
fn row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let raw: String=row.get(2)?;
    let data: Value=serde_json::from_str(&raw).map_err(|e| rusqlite::Error::FromSqlConversionFailure(2,rusqlite::types::Type::Text,Box::new(e)))?;
    Ok(json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?,"data":data,"thumbnail":row.get::<_,String>(3)?,"revision":row.get::<_,i64>(4)?,"deleted":row.get::<_,bool>(5)?,"savedAt":row.get::<_,i64>(6)?}))
}
fn get(db:&Connection,id:&str)->Result<Value,ApiError> {
    db.query_row("SELECT id,name,data,thumbnail,revision,deleted,saved_at FROM projects WHERE id=?1",[id],row).optional().map_err(db_error)?.ok_or_else(||error(axum::http::StatusCode::NOT_FOUND,"作品が見つかりません。"))
}
fn name(value:&str)->Result<&str,ApiError> {
    let s=value.trim(); if s.is_empty() || s.chars().count()>80 || s.chars().any(char::is_control) {return Err(ApiError::bad("作品名は1〜80文字で入力してください。"));} Ok(s)
}
fn thumbnail(value:&str)->Result<(),ApiError> {
    if !value.is_empty() && (!value.starts_with("data:image/png;base64,") || value.len()>100_000 || !value[22..].bytes().all(|c|c.is_ascii_alphanumeric() || b"+/=".contains(&c))) {return Err(ApiError::bad("サムネイルの形式またはサイズが不正です。"));} Ok(())
}
fn history(db:&Connection,id:&str)->rusqlite::Result<usize> { db.execute("INSERT INTO project_history SELECT id,revision,name,data,thumbnail,deleted,saved_at FROM projects WHERE id=?1",[id]) }
#[derive(Deserialize)]
pub struct Create { name:String, data:Plant, #[serde(default)] thumbnail:String }
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Update { expected_revision:i64, #[serde(default)] name:Option<String>, #[serde(default)] data:Option<Plant>, #[serde(default)] thumbnail:Option<String>, #[serde(default)] deleted:Option<bool>, #[serde(default)] restore_revision:Option<i64> }
pub async fn list(State(s):State<AppState>)->Result<Json<Vec<Value>>,ApiError> {
    run(s,|db|{let mut q=db.prepare("SELECT id,name,data,thumbnail,revision,deleted,saved_at FROM projects ORDER BY saved_at DESC,id").map_err(db_error)?; q.query_map([],row).map_err(db_error)?.collect::<Result<Vec<_>,_>>().map_err(db_error)}).await
}
pub async fn load(State(s):State<AppState>,Path(id):Path<String>)->Result<Json<Value>,ApiError> {run(s,move|db|get(db,&id)).await}
pub async fn create(State(s):State<AppState>,Json(body):Json<Create>)->Result<Json<Value>,ApiError> {
    name(&body.name)?;body.data.validate().map_err(ApiError::bad)?;thumbnail(&body.thumbnail)?;
    run(s,move|db|{let tx=db.unchecked_transaction().map_err(db_error)?;let id:String=tx.query_row("SELECT lower(hex(randomblob(16)))",[],|r|r.get(0)).map_err(db_error)?;
        tx.execute("INSERT INTO projects VALUES(?1,?2,?3,?4,1,0,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))",params![id,body.name.trim(),serde_json::to_string(&body.data).unwrap(),body.thumbnail]).map_err(db_error)?;
        history(&tx,&id).map_err(db_error)?;let result=get(&tx,&id)?;tx.commit().map_err(db_error)?;Ok(result)
    }).await
}
pub async fn update(State(s):State<AppState>,Path(id):Path<String>,Json(body):Json<Update>)->Result<Json<Value>,ApiError> {
    if let Some(n)=&body.name{name(n)?;} if let Some(p)=&body.data{p.validate().map_err(ApiError::bad)?;} if let Some(t)=&body.thumbnail{thumbnail(t)?;}
    run(s,move|db|{let tx=db.unchecked_transaction().map_err(db_error)?;let mut current=get(&tx,&id)?;
        if current["revision"].as_i64()!=Some(body.expected_revision) {return Err(error(axum::http::StatusCode::CONFLICT,"別の端末で更新されました。最新版を開くか、別作品として保存してください。"));}
        if let Some(rev)=body.restore_revision {
            current=tx.query_row("SELECT project_id,name,data,thumbnail,revision,deleted,saved_at FROM project_history WHERE project_id=?1 AND revision=?2",params![id,rev],row).optional().map_err(db_error)?.ok_or_else(||error(axum::http::StatusCode::NOT_FOUND,"履歴が見つかりません。"))?;
        }
        if let Some(n)=body.name{current["name"]=json!(n.trim());} if let Some(p)=body.data{current["data"]=serde_json::to_value(p).unwrap();} if let Some(t)=body.thumbnail{current["thumbnail"]=json!(t);} if let Some(d)=body.deleted{current["deleted"]=json!(d);}
        tx.execute("UPDATE projects SET name=?2,data=?3,thumbnail=?4,revision=?5,deleted=?6,saved_at=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) WHERE id=?1",params![id,current["name"].as_str().unwrap(),current["data"].to_string(),current["thumbnail"].as_str().unwrap(),body.expected_revision+1,current["deleted"].as_bool().unwrap()]).map_err(db_error)?;
        history(&tx,&id).map_err(db_error)?;let result=get(&tx,&id)?;tx.commit().map_err(db_error)?;Ok(result)
    }).await
}
pub async fn revisions(State(s):State<AppState>,Path(id):Path<String>)->Result<Json<Vec<Value>>,ApiError> {
    run(s,move|db|{get(db,&id)?;let mut q=db.prepare("SELECT project_id,name,data,thumbnail,revision,deleted,saved_at FROM project_history WHERE project_id=?1 ORDER BY revision DESC").map_err(db_error)?;q.query_map([id],row).map_err(db_error)?.collect::<Result<Vec<_>,_>>().map_err(db_error)}).await
}
