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

async fn get_json(path: &str, query: &[(String, String)]) -> Result<Value, String> {
    // Разрешаем только относительные пути API, чтобы фронтенд не мог
    // отправить токен на чужой адрес.
    if !path.starts_with('/') || path.contains("://") || path.contains("..") {
        return Err("bad_path".into());
    }
    let resp = client()?
        .get(format!("{API}{path}"))
        .query(query)
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
    fn parses_download_info_xml() {
        let xml = "<download-info><host>s1.storage</host><path>/rmusic/abc</path><ts>0005</ts><region>-1</region><s>deadbeef</s></download-info>";
        assert_eq!(xml_tag(xml, "host"), Some("s1.storage"));
        assert_eq!(xml_tag(xml, "path"), Some("/rmusic/abc"));
        assert_eq!(xml_tag(xml, "s"), Some("deadbeef"));
    }
}
