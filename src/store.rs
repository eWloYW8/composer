use std::{path::PathBuf, sync::Arc};

use anyhow::{Context, bail};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;

use crate::docs::{SingBoxDocs, SingBoxDocsConfig};
use crate::model::{AppSettings, ComposerState, ComposerVersion, ComposerVersionSummary};
use crate::network;
use crate::schema::{self, ComposerSchema};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct PersistedData {
    state: ComposerState,
    versions: Vec<ComposerVersion>,
    settings: AppSettings,
}

impl Default for PersistedData {
    fn default() -> Self {
        Self {
            state: ComposerState::default(),
            versions: Vec::new(),
            settings: AppSettings::default(),
        }
    }
}

#[derive(Clone)]
pub struct AppStore {
    path: Arc<PathBuf>,
    schema_path: Arc<PathBuf>,
    docs: SingBoxDocs,
    data: Arc<RwLock<PersistedData>>,
}

impl AppStore {
    pub async fn load_or_create(
        path: PathBuf,
        schema_path: PathBuf,
        docs_config: SingBoxDocsConfig,
    ) -> anyhow::Result<Self> {
        schema::load_schema(&schema_path).await?;
        let docs = SingBoxDocs::load(docs_config).await?;
        let mut data = if path.exists() {
            let content = tokio::fs::read_to_string(&path)
                .await
                .with_context(|| format!("failed to read {}", path.display()))?;
            parse_persisted_data(&content, &path)?
        } else {
            PersistedData::default()
        };
        data.state.metadata.normalize_fixed_fields();
        data.settings = network::normalize_settings(data.settings)?;
        for version in &mut data.versions {
            version.state.metadata.normalize_fixed_fields();
        }
        let store = Self {
            path: Arc::new(path),
            schema_path: Arc::new(schema_path),
            docs,
            data: Arc::new(RwLock::new(data)),
        };
        store.save().await?;
        Ok(store)
    }

    pub async fn get(&self) -> ComposerState {
        self.data.read().await.state.clone()
    }

    pub async fn schema(&self) -> anyhow::Result<ComposerSchema> {
        schema::load_schema(&self.schema_path).await
    }

    pub fn docs(&self) -> SingBoxDocs {
        self.docs.clone()
    }

    pub async fn settings(&self) -> AppSettings {
        self.data.read().await.settings.clone()
    }

    pub async fn replace_settings(&self, settings: AppSettings) -> anyhow::Result<AppSettings> {
        let settings = network::normalize_settings(settings)?;
        {
            let mut guard = self.data.write().await;
            guard.settings = settings;
        }
        self.save().await?;
        Ok(self.settings().await)
    }

    pub async fn replace(&self, mut state: ComposerState) -> anyhow::Result<ComposerState> {
        state.metadata.normalize_fixed_fields();
        state.metadata.updated_at = Some(Utc::now());
        {
            let mut guard = self.data.write().await;
            guard.state = state;
        }
        self.save().await?;
        Ok(self.get().await)
    }

    pub async fn versions(&self) -> Vec<ComposerVersionSummary> {
        let data = self.data.read().await;
        let mut versions = data
            .versions
            .iter()
            .map(ComposerVersionSummary::from)
            .collect::<Vec<_>>();
        versions.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        versions
    }

    pub async fn create_version(
        &self,
        name: String,
        description: String,
    ) -> anyhow::Result<Vec<ComposerVersionSummary>> {
        let name = normalize_version_name(name);
        let description = description.trim().to_string();
        {
            let mut data = self.data.write().await;
            let version = ComposerVersion::new(name, description, data.state.clone());
            data.versions.push(version);
        }
        self.save().await?;
        Ok(self.versions().await)
    }

    pub async fn delete_version(
        &self,
        version_id: &str,
    ) -> anyhow::Result<Vec<ComposerVersionSummary>> {
        {
            let mut data = self.data.write().await;
            let before = data.versions.len();
            data.versions.retain(|version| version.id != version_id);
            if data.versions.len() == before {
                bail!("version {version_id} not found");
            }
        }
        self.save().await?;
        Ok(self.versions().await)
    }

    pub async fn version_state(&self, version_id: &str) -> anyhow::Result<ComposerState> {
        let data = self.data.read().await;
        data.versions
            .iter()
            .find(|version| version.id == version_id)
            .map(|version| version.state.clone())
            .ok_or_else(|| anyhow::anyhow!("version {version_id} not found"))
    }

    pub async fn restore_version(&self, version_id: &str) -> anyhow::Result<ComposerState> {
        let state = self.version_state(version_id).await?;
        self.replace(state).await
    }

    async fn save(&self) -> anyhow::Result<()> {
        let data = self.data.read().await;
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let content = serde_json::to_string_pretty(&*data)?;
        let tmp = self.path.with_extension("json.tmp");
        tokio::fs::write(&tmp, content).await?;
        tokio::fs::rename(&tmp, &*self.path).await?;
        Ok(())
    }
}

fn parse_persisted_data(content: &str, path: &PathBuf) -> anyhow::Result<PersistedData> {
    let value: Value = serde_json::from_str(content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    if value.get("state").is_some() {
        serde_json::from_value(value).with_context(|| format!("failed to parse {}", path.display()))
    } else {
        Ok(PersistedData {
            state: serde_json::from_value(value)
                .with_context(|| format!("failed to parse legacy state {}", path.display()))?,
            versions: Vec::new(),
            settings: AppSettings::default(),
        })
    }
}

fn normalize_version_name(name: String) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        format!("Version {}", Utc::now().format("%Y-%m-%d %H:%M:%S"))
    } else {
        trimmed.to_string()
    }
}
