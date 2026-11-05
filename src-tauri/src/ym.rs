//! Запросы к API Яндекс Музыки. Делаются с нативной стороны:
//! токен не попадает в JS, а браузерный CORS не мешает.

use serde::Deserialize;
use serde_json::Value;

use crate::auth::load_token;

const API: &str = "https://api.music.yandex.net";
const CLIENT_HEADER: &str = "YandexMusicAndroid/24023621";
/// Соль для подписи ссылки на mp3 (так же устроено в yandex-music-api).
const SIGN_SALT: &str = "XGRlBW9FXlekgbPrRHuSiA";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("YM-Vinil/0.1")
        .build()
        .map_err(|e| e.to_string())
}

fn token() -> Result<String, String> {
    load_token().ok_or_else(|| "not_authorized".to_owned())
}

fn check_path(path: &str) -> Result<(), String> {
    // Разрешаем только относительные пути API, чтобы фронтенд не мог
    // отправить токен на чужой адрес.
    if !path.starts_with('/') || path.contains("://") || path.contains("..") || path.contains('@') {
        return Err("bad_path".into());
    }
    Ok(())
}

async fn get_json(path: &str, query: &[(String, String)]) -> Result<Value, String> {
    check_path(path)?;
    let req = client()?.get(format!("{API}{path}")).query(query);
    send(req).await
}

async fn send(req: reqwest::RequestBuilder) -> Result<Value, String> {
    let resp = req
        .header("Authorization", format!("OAuth {}", token()?))
        .header("X-Yandex-Music-Client", CLIENT_HEADER)
        .header("Accept-Language", "ru")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("not_authorized".into());
    }
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("http_{}: {}", status.as_u16(), body));
    }
    Ok(body.get("result").cloned().unwrap_or(body))
}

/// Универсальный GET к API. Возвращает поле `result` ответа.
#[tauri::command]
pub async fn ym_get(path: String, query: Option<Vec<(String, String)>>) -> Result<Value, String> {
    get_json(&path, &query.unwrap_or_default()).await
}

/// POST с form-данными (например, `/tracks` с `track-ids`).
#[tauri::command]
pub async fn ym_post(path: String, form: Vec<(String, String)>) -> Result<Value, String> {
    check_path(&path)?;
    send(client()?.post(format!("{API}{path}")).form(&form)).await
}

/// POST с JSON-телом (ротор «Моей волны»).
#[tauri::command]
pub async fn ym_post_json(path: String, body: Value) -> Result<Value, String> {
    check_path(&path)?;
    send(client()?.post(format!("{API}{path}")).json(&body)).await
}

/// Хранилище треков Яндекса — только *.yandex.net / *.yandex.ru.
fn is_yandex_storage(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|h| h.ends_with(".yandex.net") || h.ends_with(".yandex.ru"))
}

/// mp3 трека целиком. В браузер он попадает как blob — так звук можно
/// обработать в Web Audio («звук винила») без ограничений CORS.
#[tauri::command]
pub async fn track_bytes(track_id: String) -> Result<tauri::ipc::Response, String> {
    let url: url::Url = resolve_track_url(&track_id).await?.parse().map_err(|e: url::ParseError| e.to_string())?;
    if !is_yandex_storage(&url) {
        return Err("bad_storage_host".into());
    }
    let bytes = client()?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}

/// Байты обложки — чтобы React посчитал цвет без проблем с CORS у canvas.
/// Только с avatars.yandex.net и без токена: обложки публичные.
#[tauri::command]
pub async fn cover_bytes(url: String) -> Result<tauri::ipc::Response, String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("avatars.yandex.net") {
        return Err("bad_cover_host".into());
    }
    let bytes = client()?
        .get(parsed)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    if bytes.len() > 5 * 1024 * 1024 {
        return Err("cover_too_big".into());
    }
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadInfo {
    codec: String,
    bitrate_in_kbps: u32,
    download_info_url: String,
}

fn xml_tag<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let start = xml.find(&format!("<{tag}>"))? + tag.len() + 2;
    let end = xml[start..].find(&format!("</{tag}>"))? + start;
    Some(&xml[start..end])
}

/// Прямая ссылка на mp3 трека в лучшем доступном битрейте.
/// Нужна активная подписка Плюс у пользователя.
#[tauri::command]
pub async fn track_url(track_id: String) -> Result<String, String> {
    resolve_track_url(&track_id).await
}

async fn resolve_track_url(track_id: &str) -> Result<String, String> {
    if !track_id.chars().all(|c| c.is_ascii_alphanumeric() || c == ':') {
        return Err("bad_track_id".into());
    }
    let infos: Vec<DownloadInfo> =
        serde_json::from_value(get_json(&format!("/tracks/{track_id}/download-info"), &[]).await?)
            .map_err(|e| e.to_string())?;
    let best = infos
        .into_iter()
        .filter(|i| i.codec == "mp3")
        .max_by_key(|i| i.bitrate_in_kbps)
        .ok_or("no_mp3")?;

    let xml = client()?
        .get(&best.download_info_url)
        .header("Authorization", format!("OAuth {}", token()?))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let host = xml_tag(&xml, "host").ok_or("bad_download_info")?;
    let path = xml_tag(&xml, "path").ok_or("bad_download_info")?;
    let ts = xml_tag(&xml, "ts").ok_or("bad_download_info")?;
    let s = xml_tag(&xml, "s").ok_or("bad_download_info")?;

    let sign = md5::compute(format!("{SIGN_SALT}{}{s}", &path[1..]));
    Ok(format!("https://{host}/get-mp3/{sign:x}/{ts}{path}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_foreign_paths() {
        assert!(check_path("/account/status").is_ok());
        assert!(check_path("https://evil.example/x").is_err());
        assert!(check_path("@evil.example").is_err());
        assert!(check_path("/../x").is_err());
    }

    #[test]
    fn storage_hosts_only() {
        let ok: url::Url = "https://s123vla.storage.yandex.net/get-mp3/x".parse().unwrap();
        let bad: url::Url = "https://evil.example/yandex.net".parse().unwrap();
        let http: url::Url = "http://s1.storage.yandex.net/x".parse().unwrap();
        assert!(is_yandex_storage(&ok));
        assert!(!is_yandex_storage(&bad));
        assert!(!is_yandex_storage(&http));
    }

    #[test]
    fn parses_download_info_xml() {
        let xml = "<download-info><host>s1.storage</host><path>/rmusic/abc</path><ts>0005</ts><region>-1</region><s>deadbeef</s></download-info>";
        assert_eq!(xml_tag(xml, "host"), Some("s1.storage"));
        assert_eq!(xml_tag(xml, "path"), Some("/rmusic/abc"));
        assert_eq!(xml_tag(xml, "s"), Some("deadbeef"));
    }
}
