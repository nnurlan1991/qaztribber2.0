use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const BACKEND_HOST: &str = "127.0.0.1";
const BACKEND_PORT: u16 = 8765;
const DEV_URL: &str = "http://localhost:5173";
const BACKEND_STARTUP_TIMEOUT_SECS: u64 = 60;

fn backend_is_ready() -> bool {
    TcpStream::connect((BACKEND_HOST, BACKEND_PORT)).is_ok()
}

fn wait_for_backend(timeout_secs: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if backend_is_ready() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

struct SidecarProcess(Child);

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! This is QazTriber.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            let url = if cfg!(debug_assertions) {
                DEV_URL.to_string()
            } else {
                let resource_path = app
                    .path()
                    .resource_dir()?
                    .join("binaries")
                    .join("qaztriber-backend")
                    .join(if cfg!(target_os = "windows") {
                        "qaztriber-backend.exe"
                    } else {
                        "qaztriber-backend"
                    });

                let child = Command::new(&resource_path)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()?;

                app.manage(SidecarProcess(child));

                if !wait_for_backend(BACKEND_STARTUP_TIMEOUT_SECS) {
                    return Err(format!(
                        "Backend не запустился за {} секунд",
                        BACKEND_STARTUP_TIMEOUT_SECS
                    )
                    .into());
                }

                format!("http://{}:{}", BACKEND_HOST, BACKEND_PORT)
            };

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
                .title("QazTriber")
                .inner_size(1200.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .center()
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
