use axum::{
    Router,
    body::Body,
    extract::{Path, Query, State},
    http::{Response, StatusCode, header},
    response::{IntoResponse, Json},
    routing::{delete, get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    docs, generator,
    model::{AppSettings, ComposerState, ComposerVersionSummary},
    schema,
    store::AppStore,
    subscription,
};

pub fn router(store: AppStore) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/schema", get(get_schema))
        .route("/schema/path", get(get_schema_path))
        .route("/settings", get(get_settings).put(put_settings))
        .route("/state", get(get_state).put(put_state))
        .route("/state.yaml", get(get_state_yaml).put(put_state_yaml))
        .route("/resolved", get(get_resolved))
        .route("/config", get(get_config))
        .route("/config.yaml", get(get_config_yaml))
        .route("/versions", get(list_versions).post(create_version))
        .route("/versions/:id", delete(delete_version))
        .route("/versions/:id/restore", post(restore_version))
        .route("/sources/refresh", post(refresh_all_sources))
        .route("/sources/:id/refresh", post(refresh_source))
        .route("/sing-box-docs/status", get(get_sing_box_docs_status))
        .route("/sing-box-docs/index", get(get_sing_box_docs_index))
        .route("/sing-box-docs/search", get(search_sing_box_docs))
        .route("/sing-box-docs/document", get(read_sing_box_doc))
        .route(
            "/sing-box-docs/cache/refresh",
            post(refresh_sing_box_docs_cache),
        )
        .with_state(store)
}

async fn health() -> Json<Value> {
    Json(serde_json::json!({"ok": true}))
}

async fn get_state(State(store): State<AppStore>) -> Json<ComposerState> {
    Json(store.get().await)
}

async fn get_schema(
    State(store): State<AppStore>,
) -> Result<Json<schema::ComposerSchema>, ApiError> {
    Ok(Json(store.schema().await?))
}

async fn get_schema_path(
    State(store): State<AppStore>,
    Query(query): Query<SchemaPathQuery>,
) -> Result<Json<Value>, ApiError> {
    let path = query.path.unwrap_or_else(|| "/".to_string());
    let pointer = if path == "/" { "" } else { path.as_str() };
    let schema = serde_json::to_value(store.schema().await?)?;
    let value = schema
        .pointer(pointer)
        .ok_or_else(|| ApiError::not_found(format!("schema path {path} not found")))?
        .clone();
    Ok(Json(serde_json::json!({
        "path": path,
        "value": value
    })))
}

async fn get_settings(State(store): State<AppStore>) -> Json<AppSettings> {
    Json(store.settings().await)
}

async fn put_settings(
    State(store): State<AppStore>,
    Json(settings): Json<AppSettings>,
) -> Result<Json<AppSettings>, ApiError> {
    Ok(Json(store.replace_settings(settings).await?))
}

async fn put_state(
    State(store): State<AppStore>,
    Json(state): Json<ComposerState>,
) -> Result<Json<ComposerState>, ApiError> {
    let schema = store.schema().await?;
    schema::validate_composer_state(&schema, &state)?;
    Ok(Json(store.replace(state).await?))
}

async fn get_state_yaml(State(store): State<AppStore>) -> Result<Response<Body>, ApiError> {
    let content = serde_yaml::to_string(&store.get().await)?;
    Ok(text_response("application/yaml", content))
}

async fn put_state_yaml(
    State(store): State<AppStore>,
    body: String,
) -> Result<Json<ComposerState>, ApiError> {
    let state: ComposerState = serde_yaml::from_str(&body)?;
    let schema = store.schema().await?;
    schema::validate_composer_state(&schema, &state)?;
    Ok(Json(store.replace(state).await?))
}

async fn get_resolved(State(store): State<AppStore>) -> Result<Json<Value>, ApiError> {
    let state = store.get().await;
    let schema = store.schema().await?;
    schema::validate_composer_state(&schema, &state)?;
    let resolved = generator::resolve_state(&state)?;
    Ok(Json(serde_json::to_value(resolved)?))
}

async fn get_config(State(store): State<AppStore>) -> Result<Json<Value>, ApiError> {
    let state = store.get().await;
    let schema = store.schema().await?;
    schema::validate_composer_state(&schema, &state)?;
    Ok(Json(generator::generate_sing_box_config(&state)?))
}

async fn get_config_yaml(State(store): State<AppStore>) -> Result<Response<Body>, ApiError> {
    let state = store.get().await;
    let schema = store.schema().await?;
    schema::validate_composer_state(&schema, &state)?;
    let config = generator::generate_sing_box_config(&state)?;
    Ok(text_response(
        "application/yaml",
        serde_yaml::to_string(&config)?,
    ))
}

async fn list_versions(State(store): State<AppStore>) -> Json<Vec<ComposerVersionSummary>> {
    Json(store.versions().await)
}

async fn create_version(
    State(store): State<AppStore>,
    Json(request): Json<CreateVersionRequest>,
) -> Result<Json<Vec<ComposerVersionSummary>>, ApiError> {
    Ok(Json(
        store
            .create_version(request.name, request.description.unwrap_or_default())
            .await?,
    ))
}

async fn delete_version(
    State(store): State<AppStore>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ComposerVersionSummary>>, ApiError> {
    Ok(Json(store.delete_version(&id).await?))
}

async fn restore_version(
    State(store): State<AppStore>,
    Path(id): Path<String>,
) -> Result<Json<ComposerState>, ApiError> {
    let schema = store.schema().await?;
    let state = store.version_state(&id).await?;
    schema::validate_composer_state(&schema, &state)?;
    Ok(Json(store.restore_version(&id).await?))
}

async fn refresh_source(
    State(store): State<AppStore>,
    Path(id): Path<String>,
) -> Result<Json<RefreshResponse>, ApiError> {
    let mut state = store.get().await;
    let settings = store.settings().await;
    let source = state
        .proxy_sources
        .iter_mut()
        .find(|source| source.id == id)
        .ok_or_else(|| ApiError::not_found(format!("source {} not found", id)))?;
    let count = subscription::refresh_source(source, &settings.network).await?;
    let state = store.replace(state).await?;
    Ok(Json(RefreshResponse {
        ok: true,
        refreshed: vec![SourceRefreshResult { id, count }],
        state,
    }))
}

async fn refresh_all_sources(
    State(store): State<AppStore>,
) -> Result<Json<RefreshResponse>, ApiError> {
    let mut state = store.get().await;
    let settings = store.settings().await;
    let mut refreshed = Vec::new();
    for source in &mut state.proxy_sources {
        let count = subscription::refresh_source(source, &settings.network)
            .await
            .map_err(|err| anyhow::anyhow!("{}: {err}", source.name))?;
        refreshed.push(SourceRefreshResult {
            id: source.id.clone(),
            count,
        });
    }
    let state = store.replace(state).await?;
    Ok(Json(RefreshResponse {
        ok: true,
        refreshed,
        state,
    }))
}

async fn get_sing_box_docs_status(State(store): State<AppStore>) -> Json<docs::DocsStatus> {
    Json(store.docs().status().await)
}

async fn get_sing_box_docs_index(
    State(store): State<AppStore>,
) -> Result<Json<docs::DocsIndexResponse>, ApiError> {
    let settings = store.settings().await;
    Ok(Json(store.docs().index(&settings.network).await?))
}

async fn search_sing_box_docs(
    State(store): State<AppStore>,
    Query(query): Query<DocSearchQuery>,
) -> Result<Json<docs::DocSearchResponse>, ApiError> {
    let settings = store.settings().await;
    Ok(Json(
        store
            .docs()
            .search(query.q, query.limit.unwrap_or(8), &settings.network)
            .await?,
    ))
}

async fn read_sing_box_doc(
    State(store): State<AppStore>,
    Query(query): Query<DocReadQuery>,
) -> Result<Json<docs::DocReadResponse>, ApiError> {
    let settings = store.settings().await;
    Ok(Json(
        store
            .docs()
            .read_document(
                query.path,
                query.force_refresh.unwrap_or(false),
                &settings.network,
            )
            .await?,
    ))
}

async fn refresh_sing_box_docs_cache(
    State(store): State<AppStore>,
    Json(request): Json<docs::DocsRefreshRequest>,
) -> Result<Json<docs::DocsRefreshResponse>, ApiError> {
    let settings = store.settings().await;
    Ok(Json(
        store
            .docs()
            .refresh_cache(request, &settings.network)
            .await?,
    ))
}

fn text_response(content_type: &'static str, content: String) -> Response<Body> {
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(content))
        .expect("response builder cannot fail")
}

#[derive(Debug, Serialize)]
struct RefreshResponse {
    ok: bool,
    refreshed: Vec<SourceRefreshResult>,
    state: ComposerState,
}

#[derive(Debug, Serialize)]
struct SourceRefreshResult {
    id: String,
    count: usize,
}

#[derive(Debug, Deserialize)]
struct CreateVersionRequest {
    name: String,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SchemaPathQuery {
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DocSearchQuery {
    q: String,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct DocReadQuery {
    path: String,
    force_refresh: Option<bool>,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn not_found(message: String) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let body = Json(serde_json::json!({ "error": self.message }));
        (self.status, body).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: error.to_string(),
        }
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(error: serde_json::Error) -> Self {
        anyhow::Error::from(error).into()
    }
}

impl From<serde_yaml::Error> for ApiError {
    fn from(error: serde_yaml::Error) -> Self {
        anyhow::Error::from(error).into()
    }
}
