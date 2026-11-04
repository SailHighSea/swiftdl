//! "Is there a newer SwiftDL?" Looks at the GitHub releases and tells the
//! user where to get it; nothing is downloaded or installed automatically.

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use swiftdl_engine::Client;

pub const REPO: &str = "SailHighSea/swiftdl";

/// What this build is. Dev builds are tagged like `v0.3.1-dev4`; the workflow
/// passes the tag in, otherwise it's the plain version.
pub fn current_tag() -> String {
    option_env!("SWIFTDL_BUILD_TAG").filter(|t| !t.is_empty()).map(String::from).unwrap_or_else(|| format!("v{}", env!("CARGO_PKG_VERSION")))
}

/// Orders releases: `0.3.1-dev2` < `0.3.1-dev10` < `0.3.1` < `0.3.2-dev1`.
fn key(tag: &str) -> Option<(u32, u32, u32, u32)> {
    let t = tag.trim_start_matches('v');
    let (ver, dev) = match t.split_once("-dev") {
        Some((v, n)) => (v, n.parse().ok()?),
        None => (t, u32::MAX),
    };
    let mut p = ver.split('.').map(|x| x.parse::<u32>().ok());
    Some((p.next()??, p.next()??, p.next()??, dev))
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub tag: String,
    pub url: String,
    pub prerelease: bool,
}

/// The newest release for this channel if it's newer than the running build.
pub async fn check(client: &Client, include_dev: bool) -> Result<Option<UpdateInfo>> {
    let url = format!("https://api.github.com/repos/{REPO}/releases?per_page=30");
    let res = client
        .get(&url)
        .header("User-Agent", format!("SwiftDL/{}", env!("CARGO_PKG_VERSION")))
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .context("couldn't reach GitHub")?;
    if !res.status().is_success() {
        bail!("GitHub answered {}", res.status());
    }
    let body = res.bytes().await.context("couldn't read GitHub's answer")?;
    let releases: Vec<Release> = serde_json::from_slice(&body).context("unexpected answer from GitHub")?;
    let current = key(&current_tag());
    let best = releases
        .into_iter()
        .filter(|r| !r.draft && (include_dev || !r.prerelease))
        .filter_map(|r| key(&r.tag_name).map(|k| (k, r)))
        .max_by_key(|(k, _)| *k);
    Ok(best.filter(|(k, _)| Some(*k) > current).map(|(_, r)| UpdateInfo { tag: r.tag_name, url: r.html_url, prerelease: r.prerelease }))
}

#[cfg(test)]
mod tests {
    use super::key;

    #[test]
    fn orders_versions() {
        assert!(key("v0.3.1-dev2") < key("v0.3.1-dev10"));
        assert!(key("v0.3.1-dev10") < key("v0.3.1"));
        assert!(key("v0.3.1") < key("v0.3.2-dev1"));
        assert!(key("v0.3.9") < key("v0.10.0"));
        assert_eq!(key("nonsense"), None);
    }
}
