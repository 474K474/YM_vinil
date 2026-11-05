//! Локальная авторизация в Яндекс Музыке.
//!
//! Вход идёт через официальную страницу oauth.yandex.ru в отдельном окне.
//! Пароль приложение не видит: после входа Яндекс делает редирект вида
//! `https://music.yandex.ru/#access_token=...`, мы забираем токен из адреса,
//! кладём в системное хранилище (Credential Manager / Keychain / Secret Service)
//! и закрываем окно. Никаких своих серверов — токен не покидает компьютер.

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

/// client_id официального клиента Яндекс Музыки — так же логинятся
/// неофициальные библиотеки (yandex-music-api и др.). Проект неофициальный.
const CLIENT_ID: &str = "23cabbbdc6cd418abb4b39c32c41195d";
const KEYRING_SERVICE: &str = "ym-vinil";
const KEYRING_USER: &str = "yandex-music-token";
const LOGIN_WINDOW: &str = "login";

/// Событие для главного окна: вход завершён (или окно закрыли без входа).
pub const EVENT_LOGIN_SUCCESS: &str = "auth://success";
pub const EVENT_LOGIN_CANCELLED: &str = "auth://cancelled";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

pub fn load_token() -> Option<String> {
    entry().ok()?.get_password().ok().filter(|t| !t.is_empty())
}

fn save_token(token: &str) -> Result<(), String> {
    entry()?.set_password(token).map_err(|e| e.to_string())
}

/// Достаёт `access_token` из фрагмента адреса после редиректа Яндекса.
fn extract_token(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    if !(host == "yandex.ru" || host.ends_with(".yandex.ru") || host.ends_with(".yandex.com")) {
        return None;
    }
    url.fragment()?
        .split('&')
        .find_map(|pair| pair.strip_prefix("access_token="))
        .filter(|t| !t.is_empty())
        .map(str::to_owned)
}

#[tauri::command]
pub fn has_token() -> bool {
    load_token().is_some()
}

#[tauri::command]
pub fn logout() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Открывает окно входа. Окно создаётся в async-команде: на Windows создание
/// окна из синхронной команды может подвесить приложение.
#[tauri::command]
pub async fn start_login(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = window.set_focus();
        return Ok(());
    }

    let auth_url: Url = format!(
        "https://oauth.yandex.ru/authorize?response_type=token&client_id={CLIENT_ID}"
    )
    .parse()
    .map_err(|e: url::ParseError| e.to_string())?;

    // Токен может прийти и в on_navigation, и в on_page_load — обрабатываем один раз.
    let done = Arc::new(AtomicBool::new(false));

    let handle_token = {
        let app = app.clone();
        let done = done.clone();
        move |url: &Url| -> bool {
            let Some(token) = extract_token(url) else {
                return false;
            };
            if done.swap(true, Ordering::SeqCst) {
                return true;
            }
            let app = app.clone();
            // Закрываем окно вне колбэка навигации, чтобы не поймать дедлок.
            tauri::async_runtime::spawn(async move {
                match save_token(&token) {
                    Ok(()) => {
                        let _ = app.emit(EVENT_LOGIN_SUCCESS, ());
                    }
                    Err(e) => {
                        let _ = app.emit(EVENT_LOGIN_CANCELLED, e);
                    }
                }
                if let Some(window) = app.get_webview_window(LOGIN_WINDOW) {
                    let _ = window.close();
                }
            });
            true
        }
    };

    let on_nav = handle_token.clone();
    let on_load = handle_token;
    let window = WebviewWindowBuilder::new(&app, LOGIN_WINDOW, WebviewUrl::External(auth_url))
        .title("Вход в Яндекс")
        .inner_size(480.0, 720.0)
        .resizable(true)
        .center()
        .on_navigation(move |url| !on_nav(url))
        .on_page_load(move |_webview, payload| {
            on_load(payload.url());
        })
        .build()
        .map_err(|e| e.to_string())?;

    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if !done.load(Ordering::SeqCst) {
                let _ = app_for_close.emit(EVENT_LOGIN_CANCELLED, ());
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_token_from_redirect() {
        let url: Url = "https://music.yandex.ru/#access_token=AQAAAAA123&token_type=bearer&expires_in=31536000"
            .parse()
            .unwrap();
        assert_eq!(extract_token(&url).as_deref(), Some("AQAAAAA123"));
    }

    #[test]
    fn ignores_foreign_hosts_and_missing_token() {
        let evil: Url = "https://evil.example/#access_token=x".parse().unwrap();
        assert_eq!(extract_token(&evil), None);
        let plain: Url = "https://oauth.yandex.ru/authorize?x=1".parse().unwrap();
        assert_eq!(extract_token(&plain), None);
    }
}
