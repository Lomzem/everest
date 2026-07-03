use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, State, WebviewWindow, Window, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct AppState {
    document_edited: Mutex<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsedRdlFile {
    path: String,
    document: serde_json::Value,
    source: RdlSource,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RdlSource {
    root_path: String,
    text: String,
    read_only: bool,
    read_only_reason: String,
}

fn ensure_rdl_extension(file_path: &str) -> String {
    if PathBuf::from(file_path).extension().is_some() {
        file_path.to_string()
    } else {
        format!("{file_path}.rdl")
    }
}

fn file_path_to_string(path: tauri_plugin_dialog::FilePath) -> Result<String, String> {
    path.into_path()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|path| format!("Unsupported non-filesystem path: {path}"))
}

fn sidecar_path(name: &str) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "Application executable has no parent directory".to_string())?;
    let mut path = exe_dir.join(name);

    #[cfg(windows)]
    {
        let already_exe = path.extension().is_some_and(|extension| extension == "exe");
        if !already_exe {
            path.as_mut_os_string().push(".exe");
        }
    }

    #[cfg(not(windows))]
    {
        if path.extension().is_some_and(|extension| extension == "exe") {
            path.set_extension("");
        }
    }

    Ok(path)
}

fn run_parser_sidecar(parser_path: &Path, file_path: &str) -> Result<Vec<u8>, String> {
    let mut command = Command::new(parser_path);
    command.arg(file_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to run RDL parser sidecar at {parser_path:?}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!(
                "RDL parser sidecar at {parser_path:?} exited with {status}",
                status = output.status
            )
        } else {
            stderr
        });
    }

    Ok(output.stdout)
}

async fn parse_rdl_file(file_path: String) -> Result<ParsedRdlFile, String> {
    let parser_path = sidecar_path("rdl-parser")?;
    let stdout = tauri::async_runtime::spawn_blocking(move || {
        run_parser_sidecar(&parser_path, file_path.as_str())
    })
    .await
    .map_err(|error| format!("Failed to join RDL parser task: {error}"))??;

    serde_json::from_slice(&stdout)
        .map_err(|error| format!("RDL parser returned invalid JSON: {error}"))
}

#[tauri::command]
async fn open_rdl_file(app: AppHandle) -> Result<Option<ParsedRdlFile>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("SystemRDL", &["rdl"])
        .blocking_pick_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };

    let file_path = file_path_to_string(file_path)?;
    parse_rdl_file(file_path).await.map(Some)
}

#[tauri::command]
async fn save_rdl_file(file_path: String, content: String) -> Result<(), String> {
    fs::write(file_path, content).map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_rdl_file_as(
    app: AppHandle,
    content: String,
    suggested_path: Option<String>,
) -> Result<Option<SaveResult>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("SystemRDL", &["rdl"])
        .set_file_name(suggested_path.unwrap_or_else(|| "untitled.rdl".to_string()))
        .blocking_save_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };

    let file_path = ensure_rdl_extension(&file_path_to_string(file_path)?);
    fs::write(&file_path, content).map_err(|error| error.to_string())?;
    Ok(Some(SaveResult { path: file_path }))
}

#[tauri::command]
async fn set_document_edited(state: State<'_, AppState>, edited: bool) -> Result<(), String> {
    *state
        .document_edited
        .lock()
        .map_err(|_| "Failed to update document state".to_string())? = edited;
    Ok(())
}

#[tauri::command]
async fn set_window_title(window: WebviewWindow, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|error| error.to_string())
}

#[tauri::command]
async fn quit_application(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

fn emit_menu_command(app: &AppHandle, command: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("rdl:menu-command", command);
    }
}

fn build_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let new_item = MenuItemBuilder::with_id("new", "New RDL")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("open", "Open RDL...")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let save_item = MenuItemBuilder::with_id("save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as_item = MenuItemBuilder::with_id("save-as", "Save As...")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let export_item = MenuItemBuilder::with_id("export-rdl-as", "Export RDL As...").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_item)
        .item(&open_item)
        .separator()
        .item(&save_item)
        .item(&save_as_item)
        .item(&export_item)
        .separator()
        .item(&quit_item)
        .build()?;
    let menu = MenuBuilder::new(app).item(&file_menu).build()?;
    app.set_menu(menu)?;
    Ok(())
}

fn handle_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let edited = window
            .state::<AppState>()
            .document_edited
            .lock()
            .map(|edited| *edited)
            .unwrap_or(false);
        if edited {
            api.prevent_close();
            let _ = window.emit("rdl:menu-command", "quit");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_rdl_file,
            save_rdl_file,
            save_rdl_file_as,
            set_document_edited,
            set_window_title,
            quit_application,
        ])
        .setup(|app| {
            build_menu(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().0.as_str() {
            "new" | "open" | "save" | "save-as" | "export-rdl-as" | "quit" => {
                emit_menu_command(app, event.id().0.as_str());
            }
            _ => {}
        })
        .on_window_event(handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
