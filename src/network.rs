use anyhow::{Context, bail};
use reqwest::{Client, ClientBuilder, RequestBuilder};
use url::Url;

use crate::model::{AppSettings, NetworkSettings};

pub fn normalize_settings(mut settings: AppSettings) -> anyhow::Result<AppSettings> {
    settings.network.proxy.url = settings.network.proxy.url.trim().to_string();
    settings.network.github.api_url = normalize_github_api_url(&settings.network.github.api_url)?;
    settings.network.github.token = settings.network.github.token.trim().to_string();
    if settings.network.proxy.enabled {
        validate_proxy_url(&settings.network.proxy.url)?;
    }
    Ok(settings)
}

pub fn build_client(
    settings: &NetworkSettings,
    accept_invalid_certs: bool,
) -> anyhow::Result<Client> {
    let mut builder = ClientBuilder::new().danger_accept_invalid_certs(accept_invalid_certs);
    builder = apply_proxy(builder, settings)?;
    Ok(builder.build()?)
}

pub fn github_api_base(settings: &NetworkSettings) -> String {
    settings
        .github
        .api_url
        .trim()
        .trim_end_matches('/')
        .to_string()
}

pub fn github_request(request: RequestBuilder, settings: &NetworkSettings) -> RequestBuilder {
    let request = request
        .header("user-agent", "Composer")
        .header("accept", "application/vnd.github+json");
    let token = settings.github.token.trim();
    if token.is_empty() {
        request
    } else {
        request.header("authorization", format!("Bearer {token}"))
    }
}

fn apply_proxy(
    mut builder: ClientBuilder,
    settings: &NetworkSettings,
) -> anyhow::Result<ClientBuilder> {
    if !settings.proxy.enabled {
        return Ok(builder);
    }
    let proxy_url = settings.proxy.url.trim();
    validate_proxy_url(proxy_url)?;
    builder = builder.proxy(reqwest::Proxy::all(proxy_url)?);
    Ok(builder)
}

fn validate_proxy_url(value: &str) -> anyhow::Result<()> {
    if value.is_empty() {
        bail!("proxy url is required when proxy is enabled");
    }
    let url = Url::parse(value).context("invalid proxy url")?;
    match url.scheme() {
        "http" | "https" | "socks5" => {}
        scheme => bail!("unsupported proxy scheme: {scheme}"),
    }
    if url.host_str().is_none() {
        bail!("proxy url host is required");
    }
    Ok(())
}

fn normalize_github_api_url(value: &str) -> anyhow::Result<String> {
    let trimmed = value.trim();
    let normalized = if trimmed.is_empty() {
        "https://api.github.com"
    } else {
        trimmed.trim_end_matches('/')
    };
    let url = Url::parse(normalized).context("invalid GitHub API URL")?;
    match url.scheme() {
        "http" | "https" => {}
        scheme => bail!("unsupported GitHub API scheme: {scheme}"),
    }
    if url.host_str().is_none() {
        bail!("GitHub API URL host is required");
    }
    Ok(normalized.to_string())
}
