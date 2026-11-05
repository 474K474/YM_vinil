//! Трей, закрытие в трей и мини-плеер (docs/PROJECT.md, 4.9).
//!
//! Музыку играет только главное окно. Трей и мини-плеер шлют ему команды
//! событием `player://cmd`, а главное окно рассылает своё состояние.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const TRAY_ID: &str = "main";
const MINI: &str = "mini";

/// Закрытие главного окна прячет его в трей (настройка в JS, по умолчанию вкл.).
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn open_mini<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(MINI) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, MINI, WebviewUrl::App("mini.html".into()))
        .title("YM Vinil — мини-плеер")
        .inner_size(380.0, 112.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()?;
    Ok(())
}

fn toggle_mini_inner<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    match app.get_webview_window(MINI) {
        Some(w) => w.close(),
        None => open_mini(app),
    }
}

/// Мини-плеер: открыть, если закрыт, иначе закрыть.
/// Async: на Windows окна нельзя создавать из синхронной команды.
#[tauri::command]
pub async fn toggle_mini(app: AppHandle) -> Result<(), String> {
    toggle_mini_inner(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
}

/// Подсказка на иконке в трее — текущий трек.
#[tauri::command]
pub fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let short: String = text.chars().take(120).collect();
        let _ = tray.set_tooltip(Some(short));
    }
}

pub fn setup<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Показать YM Vinil", true, None::<&str>)?;
    let mini = MenuItem::with_id(app, "mini", "Мини-плеер", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Пауза / Играть", true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "prev", "Предыдущий трек", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Следующий трек", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &mini, &sep1, &toggle, &prev, &next, &sep2, &quit])?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("YM Vinil")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "mini" => {
                let _ = toggle_mini_inner(app);
            }
            "quit" => app.exit(0),
            cmd => {
                let _ = app.emit_to("main", "player://cmd", cmd.to_string());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    if let Some(main) = app.get_webview_window("main") {
        let w = main.clone();
        main.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if CLOSE_TO_TRAY.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        });
    }
    Ok(())
}
