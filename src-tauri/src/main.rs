// Не открывать консоль рядом с приложением в релизной сборке на Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ym_vinil_lib::run()
}
