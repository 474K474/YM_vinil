//! Статус в Discord (docs/PROJECT.md, 4.11).
//!
//! Работает через локальный IPC Discord: данные уходят только в Discord-клиент
//! на этом же компьютере. Отдельный поток держит соединение; если Discord не
//! запущен — тихо пробуем снова не чаще раза в 20 секунд.

use std::{
    sync::{mpsc, Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, Button, StatusDisplayType, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde::Deserialize;

/// Application ID приложения «YM Vinil» на discord.com/developers. Не секрет.
const CLIENT_ID: &str = "";
const REPO_URL: &str = "https://github.com/474K474/YM_vinil";
const ICON_URL: &str = "https://raw.githubusercontent.com/474K474/YM_vinil/main/src-tauri/icons/128x128.png";
const RETRY: Duration = Duration::from_secs(20);

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub title: String,
    pub artist: String,
    pub record: String,
    pub cover: Option<String>,
    pub side: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

enum Msg {
    Set(Option<Presence>),
}

fn sender() -> &'static Mutex<mpsc::Sender<Msg>> {
    static TX: OnceLock<Mutex<mpsc::Sender<Msg>>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Msg>();
        thread::Builder::new()
            .name("discord-presence".into())
            .spawn(move || worker(rx))
            .expect("не удалось запустить поток Discord");
        Mutex::new(tx)
    })
}

/// Discord требует 2–128 символов в строках статуса.
fn fit(s: &str, fallback: &str) -> String {
    let s = if s.trim().chars().count() < 2 { fallback } else { s.trim() };
    let mut out: String = s.chars().take(128).collect();
    while out.chars().count() < 2 {
        out.push(' ');
    }
    out
}

fn is_https(url: &str) -> bool {
    url.starts_with("https://") && url.len() <= 256
}

fn send_activity(client: &mut DiscordIpcClient, p: &Presence) -> Result<(), String> {
    let details = fit(&p.title, "Без названия");
    let state = fit(&p.artist, "YM Vinil");
    let large_text = fit(&p.record, "YM Vinil");
    let small_text = format!("Сторона {}", p.side);
    let cover = p.cover.clone().filter(|c| is_https(c));

    let mut assets = Assets::new().small_image(ICON_URL).small_text(&small_text);
    assets = match &cover {
        Some(c) => assets.large_image(c).large_text(&large_text),
        None => assets.large_image(ICON_URL).large_text(&large_text),
    };

    let activity = Activity::new()
        .activity_type(ActivityType::Listening)
        .status_display_type(StatusDisplayType::Details)
        .details(&details)
        .state(&state)
        .assets(assets)
        .timestamps(Timestamps::new().start(p.start_ms).end(p.end_ms))
        .buttons(vec![Button::new("YM Vinil на GitHub", REPO_URL)]);

    client.set_activity(activity).map_err(|e| e.to_string())
}

fn worker(rx: mpsc::Receiver<Msg>) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut last_try: Option<Instant> = None;
    let mut wanted: Option<Presence> = None;

    loop {
        // Ждём новую команду; раз в RETRY просыпаемся, чтобы переподключиться.
        match rx.recv_timeout(RETRY) {
            Ok(Msg::Set(p)) => wanted = p,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if wanted.is_none() || client.is_some() {
                    continue;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        if client.is_none() {
            if wanted.is_none() {
                continue;
            }
            if last_try.is_some_and(|t| t.elapsed() < RETRY) {
                continue;
            }
            last_try = Some(Instant::now());
            let mut c = DiscordIpcClient::new(CLIENT_ID);
            if c.connect().is_err() {
                continue; // Discord не запущен
            }
            client = Some(c);
        }

        let c = client.as_mut().expect("клиент подключён");
        let result = match &wanted {
            Some(p) => send_activity(c, p),
            None => c.clear_activity().map_err(|e| e.to_string()),
        };
        if result.is_err() {
            // Discord закрыли — соединение пересоздадим при следующем обновлении.
            let _ = c.close();
            client = None;
        }
    }

    if let Some(mut c) = client {
        let _ = c.clear_activity();
        let _ = c.close();
    }
}

/// Есть ли у сборки Application ID — без него статус недоступен.
#[tauri::command]
pub fn discord_available() -> bool {
    !CLIENT_ID.is_empty()
}

/// Обновить статус (`None` — убрать).
#[tauri::command]
pub fn discord_set(presence: Option<Presence>) {
    if CLIENT_ID.is_empty() {
        return;
    }
    if let Ok(tx) = sender().lock() {
        let _ = tx.send(Msg::Set(presence));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fits_discord_limits() {
        assert_eq!(fit("A", "Без названия"), "Без названия");
        assert_eq!(fit("  ", "OK"), "OK");
        assert_eq!(fit(&"x".repeat(300), "-").chars().count(), 128);
        assert_eq!(fit("Hi", "-"), "Hi");
    }

    #[test]
    fn only_https_covers() {
        assert!(is_https("https://avatars.yandex.net/get-music-content/1/2/400x400"));
        assert!(!is_https("http://example.com/a.png"));
    }
}
