#[tauri::command(rename = "get-platform")]
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

#[tauri::command(rename = "log-message")]
fn log_message(message: String) {
    // Log dans logcat (via RustStdoutStderr sur Android)
    println!("{message}");
}

#[tauri::command(rename = "get-app-version")]
fn get_app_version(app: tauri::AppHandle) -> Result<String, String> {
    // Récupérer la version depuis la configuration Tauri
    // Cette version est celle définie dans tauri.conf.json ou tauri.android.mobile.conf.json
    // et synchronisée avec VERSION.json pendant le build GitHub Actions
    let package_info = app.package_info();
    Ok(package_info.version.to_string())
}

#[derive(serde::Serialize)]
struct NativeFetchResponse {
    status: u16,
    ok: bool,
    body: String,
    // Headers en paires (nom, valeur) pour reconstruire une Response côté JS si besoin.
    headers: Vec<(String, String)>,
}

/// Requête HTTP native (contourne CORS et ACL plugin-http).
///
/// Pourquoi: sur Android/Tauri v2, `tauri-plugin-http` peut être bloqué par ACL (capabilities).
/// Cette commande est un fallback robuste pour permettre les appels réseau (backend + cloud).
#[tauri::command(rename = "native-fetch")]
async fn native_fetch(
    url: String,
    method: Option<String>,
    headers: Option<Vec<(String, String)>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<NativeFetchResponse, String> {
    use tauri_plugin_http::reqwest;

    // #region agent log
    println!("[popcorn-debug] native-fetch ENTRY url={}, method={:?}, has_headers={}, has_body={}", 
        url, method, headers.is_some(), body.is_some());
    // Log l'URL complète pour vérifier qu'elle est correcte (10.0.2.2 pour émulateur Android)
    if url.contains("10.0.2.2") || url.contains("127.0.0.1") || url.contains("localhost") {
        println!("[popcorn-debug] native-fetch URL backend detected: {}", url);
    }
    // #endregion

    let m = method.unwrap_or_else(|| "GET".to_string());
    let m = m
        .parse::<reqwest::Method>()
        .map_err(|e| {
            let err_msg = format!("invalid method: {e}");
            println!("[popcorn-debug] native-fetch ERROR parse method: {}", err_msg);
            err_msg
        })?;

    let timeout = timeout_ms.unwrap_or(15_000);
    // #region agent log
    println!("[popcorn-debug] native-fetch building client timeout={}ms", timeout);
    // #endregion

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout))
        .build()
        .map_err(|e| {
            let err_msg = format!("client build failed: {e}");
            println!("[popcorn-debug] native-fetch ERROR build client: {}", err_msg);
            err_msg
        })?;

    let mut req = client.request(m, &url);

    if let Some(hs) = headers {
        let header_count = hs.len();
        // #region agent log
        println!("[popcorn-debug] native-fetch adding {} headers", header_count);
        // #endregion
        for (k, v) in hs {
            if k.trim().is_empty() {
                continue;
            }
            req = req.header(k, v);
        }
    }

    if let Some(b) = body {
        let body_len = b.len();
        // #region agent log
        println!("[popcorn-debug] native-fetch adding body length={}", body_len);
        // #endregion
        req = req.body(b);
    }

    // #region agent log
    println!("[popcorn-debug] native-fetch sending request to {}", url);
    // #endregion

    let resp = req.send().await.map_err(|e| {
        let err_msg = format!("send failed: {e}");
        // Détails de l'erreur réseau pour diagnostic
        let error_details = if e.is_timeout() {
            format!("TIMEOUT after {}ms to {}", timeout, url)
        } else if e.is_connect() {
            format!("CONNECTION FAILED: cannot connect to {} (backend might be down or unreachable)", url)
        } else if e.is_request() {
            format!("REQUEST ERROR: invalid request to {}", url)
        } else {
            format!("NETWORK ERROR: {} (url: {})", e, url)
        };
        println!("[popcorn-debug] native-fetch ERROR send: {}", err_msg);
        println!("[popcorn-debug] native-fetch ERROR details: {}", error_details);
        err_msg
    })?;

    let status = resp.status().as_u16();
    let ok = resp.status().is_success();

    // #region agent log
    println!("[popcorn-debug] native-fetch response status={}, ok={}", status, ok);
    // #endregion

    let mut out_headers: Vec<(String, String)> = Vec::new();
    for (k, v) in resp.headers().iter() {
        if let Ok(vs) = v.to_str() {
            out_headers.push((k.to_string(), vs.to_string()));
        }
    }

    let body = resp.text().await.map_err(|e| {
        let err_msg = format!("read body failed: {e}");
        println!("[popcorn-debug] native-fetch ERROR read body: {}", err_msg);
        err_msg
    })?;

    // #region agent log
    println!("[popcorn-debug] native-fetch SUCCESS status={}, body_len={}", status, body.len());
    // #endregion

    Ok(NativeFetchResponse {
        status,
        ok,
        body,
        headers: out_headers,
    })
}

// Entrée commune Desktop + Mobile.
// Pour Android/iOS, Tauri requiert une target "lib" et une fonction annotée.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // #region agent log
    println!("[popcorn-debug] Tauri app starting, registering commands: get_platform, log_message, native_fetch");
    // #endregion
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![get_platform, log_message, native_fetch, get_app_version])
        .setup(|_app| {
            // #region agent log
            println!("[popcorn-debug] Tauri app setup complete, commands registered");
            // Vérifier que les commandes sont bien enregistrées
            println!("[popcorn-debug] Available commands: get_platform, log_message, native_fetch");
            // #endregion
            // Client léger - pas de backend intégré
            // L'application se connecte au serveur popcorn distant
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("[popcorn-debug] FATAL: Tauri application error: {}", e);
            eprintln!("[popcorn-debug] Stack trace: {:?}", e);
            // Sur Android, on ne peut pas vraiment "quitter" proprement
            // mais on log l'erreur pour diagnostic
        });
}

