//! Модель голосового управления (docs/PROJECT.md, 4.13).
//!
//! Модель Vosk лежит в пре-релизе `voice-ru` нашего репозитория. Скачиваем её
//! один раз в папку данных приложения, сверяем SHA-256 и отдаём в WebView
//! байтами — распознавание идёт в WebAssembly, без сети.

use std::{fs, io::Write, path::PathBuf};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

const MODEL_FILE: &str = "vosk-model-small-ru-0.22.tar.gz";
const MODEL_URL: &str =
    "https://github.com/474K474/YM_vinil/releases/download/voice-ru/vosk-model-small-ru-0.22.tar.gz";
/// SHA-256 архива из релиза voice-ru (файл .sha256 рядом с ним).
const MODEL_SHA256: &str = "6c4b13fcff6e8bde3ec0c9dcfaf1e7b14767729d612ccd67ad68ac6ade244498";

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("voice");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(MODEL_FILE))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[tauri::command]
pub fn voice_model_installed(app: AppHandle) -> bool {
    model_path(&app).map(|p| p.is_file()).unwrap_or(false)
}

/// Скачивает модель с прогрессом (событие `voice://progress`, 0…1).
#[tauri::command]
pub async fn voice_model_download(app: AppHandle) -> Result<(), String> {
    let path = model_path(&app)?;
    if path.is_file() {
        return Ok(());
    }
    let tmp = path.with_extension("part");
    let mut resp = reqwest::Client::builder()
        .user_agent("YM-Vinil")
        .build()
        .map_err(|e| e.to_string())?
        .get(MODEL_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    let total = resp.content_length().unwrap_or(0);
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut got: u64 = 0;
    let mut last_pct = -1i64;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        got += chunk.len() as u64;
        if total > 0 {
            let pct = (got * 100 / total) as i64;
            if pct != last_pct {
                last_pct = pct;
                let _ = app.emit("voice://progress", got as f64 / total as f64);
            }
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    if hex(&hasher.finalize()) != MODEL_SHA256 {
        let _ = fs::remove_file(&tmp);
        return Err("Модель скачалась повреждённой — попробуйте ещё раз".into());
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Байты модели для WebView (один раз за сеанс, при первом использовании голоса).
#[tauri::command]
pub fn voice_model_bytes(app: AppHandle) -> Result<tauri::ipc::Response, String> {
    let bytes = fs::read(model_path(&app)?).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn voice_model_delete(app: AppHandle) -> Result<(), String> {
    let path = model_path(&app)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_as_lowercase_hex() {
        let h = Sha256::digest(b"vinil");
        assert_eq!(hex(&h).len(), 64);
        assert!(hex(&h).chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }
}
