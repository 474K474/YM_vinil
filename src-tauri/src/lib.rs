mod auth;
mod ym;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
