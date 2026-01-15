#[tauri::command]
fn get_platform() -> String {
    #[cfg(target_os = "windows")]
    {
        return "windows".to_string();
    }
    #[cfg(target_os = "android")]
    {
        return "android".to_string();
    }
    #[cfg(target_os = "linux")]
    {
        return "linux".to_string();
    }
    #[cfg(target_os = "macos")]
    {
        return "macos".to_string();
    }
    #[cfg(target_os = "ios")]
    {
        return "ios".to_string();
    }
    #[allow(unreachable_code)]
    {
        "unknown".to_string()
    }
}

// Entrée commune Desktop + Mobile.
// Pour Android/iOS, Tauri requiert une target "lib" et une fonction annotée.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_platform])
        .setup(|_app| {
            // Client léger - pas de backend intégré
            // L'application se connecte au serveur popcorn distant
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

