mod auth;
mod discord;
mod tray;
mod ym;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Автообновление из GitHub Releases (docs/PROJECT.md, 4.7).
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            // Трей, закрытие в трей и мини-плеер (docs/PROJECT.md, 4.9).
            tray::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::has_token,
            auth::start_login,
            auth::logout,
            ym::ym_get,
            ym::ym_post,
            ym::ym_post_json,
            ym::track_bytes,
            ym::cover_bytes,
            ym::track_url,
            tray::toggle_mini,
            discord::discord_available,
            discord::discord_set,
            tray::show_main_window,
            tray::set_close_to_tray,
            tray::set_tray_tooltip,
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
