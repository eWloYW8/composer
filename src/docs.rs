use std::{collections::BTreeMap, path::PathBuf, sync::Arc, time::Duration as StdDuration};

use anyhow::{Context, bail};
use base64::{Engine, engine::general_purpose};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use tokio::{sync::RwLock, task::JoinSet};

use crate::{model::NetworkSettings, network};

#[derive(Debug, Clone)]
pub struct SingBoxDocsConfig {
    pub cache_path: PathBuf,
    pub repo: String,
    pub branch: String,
    pub ttl_days: i64,
}

#[derive(Clone)]
pub struct SingBoxDocs {
    config: Arc<SingBoxDocsConfig>,
    cache: Arc<RwLock<DocsCache>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct DocsCache {
    repo: String,
    branch: String,
    index_fetched_at: Option<DateTime<Utc>>,
    paths: Vec<String>,
    documents: BTreeMap<String, CachedDoc>,
}

impl Default for DocsCache {
    fn default() -> Self {
        Self {
            repo: "SagerNet/sing-box".to_string(),
            branch: "testing".to_string(),
            index_fetched_at: None,
            paths: Vec::new(),
            documents: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedDoc {
    path: String,
    content: String,
    fetched_at: DateTime<Utc>,
    source_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocsStatus {
    pub repo: String,
    pub branch: String,
    pub ttl_days: i64,
    pub cache_path: String,
    pub index_fetched_at: Option<DateTime<Utc>>,
    pub index_expires_at: Option<DateTime<Utc>>,
    pub index_stale: bool,
    pub known_paths: usize,
    pub cached_documents: usize,
    pub stale_documents: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocsIndexResponse {
    pub paths: Vec<String>,
    pub status: DocsStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocSearchResponse {
    pub query: String,
    pub results: Vec<DocSearchResult>,
    pub status: DocsStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocSearchResult {
    pub path: String,
    pub title: String,
    pub score: usize,
    pub headings: Vec<String>,
    pub snippet: String,
    pub cached: bool,
    pub source_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocReadResponse {
    pub path: String,
    pub title: String,
    pub content: String,
    pub headings: Vec<String>,
    pub fetched_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub source_url: String,
    pub from_cache: bool,
    pub status: DocsStatus,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DocsRefreshRequest {
    pub clear: bool,
    pub fetch_all: bool,
    pub paths: Vec<String>,
}

impl Default for DocsRefreshRequest {
    fn default() -> Self {
        Self {
            clear: false,
            fetch_all: false,
            paths: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DocsRefreshResponse {
    pub refreshed_documents: usize,
    pub status: DocsStatus,
}

#[derive(Debug, Deserialize)]
struct GitTreeResponse {
    tree: Vec<GitTreeItem>,
}

#[derive(Debug, Deserialize)]
struct GitTreeItem {
    path: String,
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Debug, Deserialize)]
struct GitContentResponse {
    content: String,
    encoding: String,
    download_url: Option<String>,
}

impl SingBoxDocs {
    pub async fn load(config: SingBoxDocsConfig) -> anyhow::Result<Self> {
        let mut cache = if config.cache_path.exists() {
            let content = tokio::fs::read_to_string(&config.cache_path)
                .await
                .with_context(|| {
                    format!(
                        "failed to read sing-box docs cache {}",
                        config.cache_path.display()
                    )
                })?;
            serde_json::from_str::<DocsCache>(&content).with_context(|| {
                format!(
                    "failed to parse sing-box docs cache {}",
                    config.cache_path.display()
                )
            })?
        } else {
            DocsCache::default()
        };
        if cache.repo != config.repo || cache.branch != config.branch {
            cache = DocsCache {
                repo: config.repo.clone(),
                branch: config.branch.clone(),
                ..DocsCache::default()
            };
        }
        Ok(Self {
            config: Arc::new(config),
            cache: Arc::new(RwLock::new(cache)),
        })
    }

    pub async fn status(&self) -> DocsStatus {
        let cache = self.cache.read().await;
        self.status_from_cache(&cache)
    }

    pub async fn index(&self, settings: &NetworkSettings) -> anyhow::Result<DocsIndexResponse> {
        let paths = self.ensure_index(false, settings).await?;
        let cache = self.cache.read().await;
        Ok(DocsIndexResponse {
            paths,
            status: self.status_from_cache(&cache),
        })
    }

    pub async fn search(
        &self,
        query: String,
        limit: usize,
        settings: &NetworkSettings,
    ) -> anyhow::Result<DocSearchResponse> {
        let query = query.trim().to_string();
        if query.is_empty() {
            bail!("query is required");
        }
        self.ensure_index(false, settings).await?;
        let terms = search_terms(&query);
        let limit = limit.clamp(1, 30);
        let cache = self.cache.read().await;
        let mut results = Vec::new();
        for path in &cache.paths {
            let Some(score) = score_path_or_doc(path, cache.documents.get(path), &terms) else {
                continue;
            };
            let cached = cache.documents.get(path);
            let (title, headings, snippet) = if let Some(doc) = cached {
                (
                    document_title(&doc.path, &doc.content),
                    document_headings(&doc.content),
                    document_snippet(&doc.content, &terms),
                )
            } else {
                (title_from_path(path), Vec::new(), path.clone())
            };
            results.push(DocSearchResult {
                path: path.clone(),
                title,
                score,
                headings,
                snippet,
                cached: cached.is_some(),
                source_url: doc_source_url(settings, &self.config.repo, &self.config.branch, path),
            });
        }
        results.sort_by(|left, right| {
            right
                .score
                .cmp(&left.score)
                .then_with(|| right.cached.cmp(&left.cached))
                .then_with(|| left.path.cmp(&right.path))
        });
        results.truncate(limit);
        Ok(DocSearchResponse {
            query,
            results,
            status: self.status_from_cache(&cache),
        })
    }

    pub async fn read_document(
        &self,
        path: String,
        force_refresh: bool,
        settings: &NetworkSettings,
    ) -> anyhow::Result<DocReadResponse> {
        let paths = self.ensure_index(false, settings).await?;
        let path = resolve_doc_path(&path, &paths)?;
        {
            let cache = self.cache.read().await;
            if !force_refresh {
                if let Some(doc) = cache.documents.get(&path) {
                    if !self.is_stale(doc.fetched_at) {
                        return Ok(self.doc_response(doc.clone(), true, &cache));
                    }
                }
            }
        }

        let doc = fetch_document(settings, &self.config.repo, &self.config.branch, path).await?;
        let mut cache = self.cache.write().await;
        cache.documents.insert(doc.path.clone(), doc.clone());
        if !cache.paths.iter().any(|item| item == &doc.path) {
            cache.paths.push(doc.path.clone());
            cache.paths.sort();
        }
        let snapshot = cache.clone();
        drop(cache);
        self.save_cache(&snapshot).await?;
        let cache = self.cache.read().await;
        Ok(self.doc_response(doc, false, &cache))
    }

    pub async fn refresh_cache(
        &self,
        request: DocsRefreshRequest,
        settings: &NetworkSettings,
    ) -> anyhow::Result<DocsRefreshResponse> {
        if request.clear {
            let mut cache = self.cache.write().await;
            cache.index_fetched_at = None;
            cache.paths.clear();
            cache.documents.clear();
            let snapshot = cache.clone();
            drop(cache);
            self.save_cache(&snapshot).await?;
        }

        let paths = self.ensure_index(true, settings).await?;
        let mut target_paths = if request.fetch_all {
            paths.clone()
        } else {
            Vec::new()
        };
        for raw_path in request.paths {
            target_paths.push(resolve_doc_path(&raw_path, &paths)?);
        }
        target_paths.sort();
        target_paths.dedup();

        let mut docs = Vec::new();
        if !target_paths.is_empty() {
            let mut joins = JoinSet::new();
            for path in target_paths {
                while joins.len() >= 8 {
                    docs.push(join_doc_fetch(&mut joins).await?);
                }
                let repo = self.config.repo.clone();
                let branch = self.config.branch.clone();
                let settings = settings.clone();
                joins.spawn(async move { fetch_document(&settings, &repo, &branch, path).await });
            }
            while !joins.is_empty() {
                docs.push(join_doc_fetch(&mut joins).await?);
            }
        }

        let refreshed_documents = docs.len();
        if refreshed_documents > 0 {
            let mut cache = self.cache.write().await;
            for doc in docs {
                cache.documents.insert(doc.path.clone(), doc);
            }
            let snapshot = cache.clone();
            drop(cache);
            self.save_cache(&snapshot).await?;
        }

        Ok(DocsRefreshResponse {
            refreshed_documents,
            status: self.status().await,
        })
    }

    async fn ensure_index(
        &self,
        force: bool,
        settings: &NetworkSettings,
    ) -> anyhow::Result<Vec<String>> {
        {
            let cache = self.cache.read().await;
            if !force
                && !cache.paths.is_empty()
                && cache
                    .index_fetched_at
                    .map(|fetched_at| !self.is_stale(fetched_at))
                    .unwrap_or(false)
            {
                return Ok(cache.paths.clone());
            }
        }

        let paths = match self.fetch_index(settings).await {
            Ok(paths) => paths,
            Err(error) if !force => {
                let cache = self.cache.read().await;
                if cache.paths.is_empty() {
                    return Err(error);
                }
                return Ok(cache.paths.clone());
            }
            Err(error) => return Err(error),
        };
        let mut cache = self.cache.write().await;
        cache.repo = self.config.repo.clone();
        cache.branch = self.config.branch.clone();
        cache.index_fetched_at = Some(Utc::now());
        cache.paths = paths.clone();
        cache
            .documents
            .retain(|path, _| paths.iter().any(|known| known == path));
        let snapshot = cache.clone();
        drop(cache);
        self.save_cache(&snapshot).await?;
        Ok(paths)
    }

    async fn fetch_index(&self, settings: &NetworkSettings) -> anyhow::Result<Vec<String>> {
        let client = network_client(settings)?;
        let url = tree_api_url(settings, &self.config.repo, &self.config.branch);
        let response = network::github_request(client.get(&url), settings)
            .send()
            .await
            .with_context(|| format!("failed to fetch {url}"))?
            .error_for_status()
            .with_context(|| format!("failed to fetch {url}"))?
            .json::<GitTreeResponse>()
            .await?;
        let mut paths = response
            .tree
            .into_iter()
            .filter(|item| item.kind == "blob")
            .filter_map(|item| item.path.strip_prefix("docs/").map(ToString::to_string))
            .filter(|path| path.ends_with(".md") || path.ends_with(".mdx"))
            .collect::<Vec<_>>();
        paths.sort();
        paths.dedup();
        if paths.is_empty() {
            bail!("sing-box docs index is empty");
        }
        Ok(paths)
    }

    async fn save_cache(&self, cache: &DocsCache) -> anyhow::Result<()> {
        if let Some(parent) = self.config.cache_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let content = serde_json::to_string_pretty(cache)?;
        let tmp = self.config.cache_path.with_extension("json.tmp");
        tokio::fs::write(&tmp, content).await?;
        tokio::fs::rename(&tmp, &self.config.cache_path).await?;
        Ok(())
    }

    fn status_from_cache(&self, cache: &DocsCache) -> DocsStatus {
        let ttl = Duration::days(self.config.ttl_days);
        let index_expires_at = cache
            .index_fetched_at
            .and_then(|value| value.checked_add_signed(ttl));
        let stale_documents = cache
            .documents
            .values()
            .filter(|doc| self.is_stale(doc.fetched_at))
            .count();
        DocsStatus {
            repo: self.config.repo.clone(),
            branch: self.config.branch.clone(),
            ttl_days: self.config.ttl_days,
            cache_path: self.config.cache_path.display().to_string(),
            index_fetched_at: cache.index_fetched_at,
            index_expires_at,
            index_stale: cache
                .index_fetched_at
                .map(|fetched_at| self.is_stale(fetched_at))
                .unwrap_or(true),
            known_paths: cache.paths.len(),
            cached_documents: cache.documents.len(),
            stale_documents,
        }
    }

    fn doc_response(&self, doc: CachedDoc, from_cache: bool, cache: &DocsCache) -> DocReadResponse {
        DocReadResponse {
            path: doc.path.clone(),
            title: document_title(&doc.path, &doc.content),
            content: doc.content.clone(),
            headings: document_headings(&doc.content),
            fetched_at: doc.fetched_at,
            expires_at: doc
                .fetched_at
                .checked_add_signed(Duration::days(self.config.ttl_days))
                .unwrap_or(doc.fetched_at),
            source_url: doc.source_url,
            from_cache,
            status: self.status_from_cache(cache),
        }
    }

    fn is_stale(&self, fetched_at: DateTime<Utc>) -> bool {
        Utc::now().signed_duration_since(fetched_at) > Duration::days(self.config.ttl_days)
    }
}

async fn join_doc_fetch(
    joins: &mut JoinSet<anyhow::Result<CachedDoc>>,
) -> anyhow::Result<CachedDoc> {
    joins
        .join_next()
        .await
        .context("document refresh task set is empty")?
        .context("document refresh task failed")?
}

async fn fetch_document(
    settings: &NetworkSettings,
    repo: &str,
    branch: &str,
    path: String,
) -> anyhow::Result<CachedDoc> {
    if !should_use_contents_api(settings) {
        return fetch_raw_document(settings, repo, branch, path).await;
    }
    fetch_api_document(settings, repo, branch, path).await
}

async fn fetch_api_document(
    settings: &NetworkSettings,
    repo: &str,
    branch: &str,
    path: String,
) -> anyhow::Result<CachedDoc> {
    let client = network_client(settings)?;
    let source_url = doc_api_url(settings, repo, branch, &path);
    let response = network::github_request(client.get(&source_url), settings)
        .send()
        .await
        .with_context(|| format!("failed to fetch {source_url}"))?
        .error_for_status()
        .with_context(|| format!("failed to fetch {source_url}"))?
        .json::<GitContentResponse>()
        .await?;
    if response.encoding != "base64" {
        bail!(
            "unsupported GitHub content encoding {} for {}",
            response.encoding,
            path
        );
    }
    let encoded = response.content.lines().collect::<String>();
    let content = String::from_utf8(general_purpose::STANDARD.decode(encoded)?)?;
    Ok(CachedDoc {
        path,
        content,
        fetched_at: Utc::now(),
        source_url: response.download_url.unwrap_or(source_url),
    })
}

async fn fetch_raw_document(
    settings: &NetworkSettings,
    repo: &str,
    branch: &str,
    path: String,
) -> anyhow::Result<CachedDoc> {
    let client = network_client(settings)?;
    let source_url = raw_doc_url(repo, branch, &path);
    let content = client
        .get(&source_url)
        .header("user-agent", "Composer")
        .send()
        .await
        .with_context(|| format!("failed to fetch {source_url}"))?
        .error_for_status()
        .with_context(|| format!("failed to fetch {source_url}"))?
        .text()
        .await?;
    Ok(CachedDoc {
        path,
        content,
        fetched_at: Utc::now(),
        source_url,
    })
}

fn network_client(settings: &NetworkSettings) -> anyhow::Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder().timeout(StdDuration::from_secs(30));
    if settings.proxy.enabled {
        builder = builder.proxy(reqwest::Proxy::all(settings.proxy.url.trim())?);
    }
    Ok(builder.build()?)
}

fn tree_api_url(settings: &NetworkSettings, repo: &str, branch: &str) -> String {
    format!(
        "{}/repos/{}/git/trees/{}?recursive=1",
        network::github_api_base(settings),
        repo,
        urlencoding::encode(branch),
    )
}

fn doc_api_url(settings: &NetworkSettings, repo: &str, branch: &str, path: &str) -> String {
    let encoded_path = path
        .split('/')
        .map(urlencoding::encode)
        .collect::<Vec<_>>()
        .join("/");
    format!(
        "{}/repos/{repo}/contents/docs/{encoded_path}?ref={}",
        network::github_api_base(settings),
        urlencoding::encode(branch),
    )
}

fn raw_doc_url(repo: &str, branch: &str, path: &str) -> String {
    let encoded_path = path
        .split('/')
        .map(urlencoding::encode)
        .collect::<Vec<_>>()
        .join("/");
    format!(
        "https://raw.githubusercontent.com/{repo}/{}/docs/{encoded_path}",
        urlencoding::encode(branch),
    )
}

fn doc_source_url(settings: &NetworkSettings, repo: &str, branch: &str, path: &str) -> String {
    if should_use_contents_api(settings) {
        doc_api_url(settings, repo, branch, path)
    } else {
        raw_doc_url(repo, branch, path)
    }
}

fn should_use_contents_api(settings: &NetworkSettings) -> bool {
    !settings.github.token.trim().is_empty()
        || network::github_api_base(settings) != "https://api.github.com"
}

fn resolve_doc_path(raw_path: &str, known_paths: &[String]) -> anyhow::Result<String> {
    let mut path = raw_path.trim().trim_start_matches('/').to_string();
    if let Some((_, suffix)) = path.split_once("/docs/") {
        path = suffix.to_string();
    }
    if let Some(suffix) = path.strip_prefix("docs/") {
        path = suffix.to_string();
    }
    if path.is_empty() || path.split('/').any(|part| part == ".." || part.is_empty()) {
        bail!("invalid sing-box document path: {raw_path}");
    }
    let candidates = if path.ends_with(".md") || path.ends_with(".mdx") {
        vec![path.clone()]
    } else {
        vec![
            path.clone(),
            format!("{path}.md"),
            format!("{path}.mdx"),
            format!("{path}/index.md"),
            format!("{path}/index.mdx"),
        ]
    };
    for candidate in candidates {
        if known_paths.iter().any(|known| known == &candidate) {
            return Ok(candidate);
        }
    }
    if path.ends_with(".md") || path.ends_with(".mdx") {
        return Ok(path);
    }
    bail!("sing-box document path not found: {raw_path}");
}

fn search_terms(query: &str) -> Vec<String> {
    query
        .split(|ch: char| ch.is_whitespace() || matches!(ch, ',' | ';' | '，' | '；'))
        .map(|term| term.trim().to_ascii_lowercase())
        .filter(|term| !term.is_empty())
        .collect()
}

fn score_path_or_doc(path: &str, doc: Option<&CachedDoc>, terms: &[String]) -> Option<usize> {
    if terms.is_empty() {
        return None;
    }
    let mut score = score_text(&path.to_ascii_lowercase(), terms) * 20;
    if let Some(doc) = doc {
        let title = document_title(path, &doc.content).to_ascii_lowercase();
        let headings = document_headings(&doc.content)
            .join("\n")
            .to_ascii_lowercase();
        let content = doc.content.to_ascii_lowercase();
        score += score_text(&title, terms) * 50;
        score += score_text(&headings, terms) * 30;
        score += score_text(&content, terms);
    }
    (score > 0).then_some(score)
}

fn score_text(text: &str, terms: &[String]) -> usize {
    terms
        .iter()
        .map(|term| {
            let mut count = 0;
            let mut remainder = text;
            while let Some(index) = remainder.find(term) {
                count += 1;
                remainder = &remainder[index + term.len()..];
            }
            count
        })
        .sum()
}

fn document_title(path: &str, content: &str) -> String {
    content
        .lines()
        .find_map(|line| {
            line.strip_prefix("# ")
                .map(|title| title.trim().to_string())
        })
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| title_from_path(path))
}

fn document_headings(content: &str) -> Vec<String> {
    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim_start();
            if !trimmed.starts_with('#') {
                return None;
            }
            let title = trimmed.trim_start_matches('#').trim();
            (!title.is_empty()).then(|| title.to_string())
        })
        .take(32)
        .collect()
}

fn document_snippet(content: &str, terms: &[String]) -> String {
    let lower = content.to_ascii_lowercase();
    let index = terms
        .iter()
        .filter_map(|term| lower.find(term))
        .min()
        .unwrap_or(0);
    let start = floor_char_boundary(content, index.saturating_sub(160));
    let end = ceil_char_boundary(content, (index + 420).min(content.len()));
    content[start..end]
        .replace('\n', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn floor_char_boundary(value: &str, mut index: usize) -> usize {
    index = index.min(value.len());
    while index > 0 && !value.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char_boundary(value: &str, mut index: usize) -> usize {
    index = index.min(value.len());
    while index < value.len() && !value.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn title_from_path(path: &str) -> String {
    path.rsplit('/')
        .next()
        .unwrap_or(path)
        .trim_end_matches(".md")
        .trim_end_matches(".mdx")
        .replace('-', " ")
}
