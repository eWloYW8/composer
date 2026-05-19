mod api;
mod docs;
mod generator;
mod model;
mod network;
mod schema;
mod store;
mod subscription;

use std::{net::SocketAddr, path::PathBuf};

use anyhow::Context;
use axum::Router;
use clap::Parser;
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::docs::SingBoxDocsConfig;
use crate::store::AppStore;

#[derive(Debug, Parser)]
#[command(version, about = "sing-box configuration composer")]
struct Args {
    #[arg(long, env = "COMPOSER_LISTEN", default_value = "127.0.0.1")]
    listen: String,

    #[arg(long, env = "COMPOSER_PORT", default_value_t = 3300)]
    port: u16,

    #[arg(long, env = "COMPOSER_DATA", default_value = "data/composer.json")]
    data: PathBuf,

    #[arg(long, env = "COMPOSER_SCHEMA", default_value = "schemas/singbox")]
    schema: PathBuf,

    #[arg(long, env = "COMPOSER_WEB_DIR", default_value = "frontend/dist")]
    web_dir: PathBuf,

    #[arg(
        long,
        env = "COMPOSER_SING_BOX_DOCS_CACHE",
        default_value = "data/sing-box-docs-cache.json"
    )]
    sing_box_docs_cache: PathBuf,

    #[arg(
        long,
        env = "COMPOSER_SING_BOX_DOCS_REPO",
        default_value = "SagerNet/sing-box"
    )]
    sing_box_docs_repo: String,

    #[arg(long, env = "COMPOSER_SING_BOX_DOCS_BRANCH", default_value = "testing")]
    sing_box_docs_branch: String,

    #[arg(long, env = "COMPOSER_SING_BOX_DOCS_TTL_DAYS", default_value_t = 7)]
    sing_box_docs_ttl_days: i64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "composer=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let docs_config = SingBoxDocsConfig {
        cache_path: args.sing_box_docs_cache,
        repo: args.sing_box_docs_repo,
        branch: args.sing_box_docs_branch,
        ttl_days: args.sing_box_docs_ttl_days.max(1),
    };
    let store = AppStore::load_or_create(args.data, args.schema, docs_config)
        .await
        .context("failed to initialize store")?;

    let api = api::router(store.clone());
    let app = if args.web_dir.exists() {
        Router::new()
            .nest("/api", api)
            .fallback_service(ServeDir::new(args.web_dir))
    } else {
        Router::new().nest("/api", api)
    }
    .layer(CorsLayer::permissive())
    .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = format!("{}:{}", args.listen, args.port)
        .parse()
        .context("invalid listen address")?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("composer listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
