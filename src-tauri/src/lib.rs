use serde::{Deserialize, Serialize};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, Window, WindowEvent};
use tauri_plugin_dialog::DialogExt;

const RDL_PARSER_BYTES: &[u8] = include_bytes!(env!("RDL_PARSER_SIDECAR_PATH"));
const RDL_PARSER_TARGET: &str = env!("RDL_PARSER_TARGET");

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

#[derive(Debug, PartialEq, Eq)]
struct SaveDialogSuggestion {
    directory: Option<String>,
    file_name: String,
}

fn save_dialog_suggestion(suggested_path: Option<String>) -> SaveDialogSuggestion {
    let suggested_path = suggested_path.unwrap_or_else(|| "untitled.rdl".to_string());
    let suggested_path = suggested_path.trim();
    if suggested_path.is_empty() {
        return SaveDialogSuggestion {
            directory: None,
            file_name: "untitled.rdl".to_string(),
        };
    }

    let Some(separator_index) = suggested_path.rfind(['/', '\\']) else {
        return SaveDialogSuggestion {
            directory: None,
            file_name: suggested_path.to_string(),
        };
    };
    let directory = suggested_path[..separator_index].trim_end_matches(['/', '\\']);
    let file_name = suggested_path[separator_index + 1..].trim();

    SaveDialogSuggestion {
        directory: if directory.is_empty() {
            None
        } else {
            Some(directory.to_string())
        },
        file_name: if file_name.is_empty() {
            "untitled.rdl".to_string()
        } else {
            file_name.to_string()
        },
    }
}

fn file_path_to_string(path: tauri_plugin_dialog::FilePath) -> Result<String, String> {
    path.into_path()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|path| format!("Unsupported non-filesystem path: {path}"))
}

fn parser_cache_key() -> u64 {
    let mut hasher = DefaultHasher::new();
    RDL_PARSER_BYTES.hash(&mut hasher);
    hasher.finish()
}

fn parser_sidecar_path() -> Result<PathBuf, String> {
    let extension = if cfg!(windows) { ".exe" } else { "" };
    let parser_name = format!(
        "rdl-parser-{target}-{version}-{hash:016x}{extension}",
        target = RDL_PARSER_TARGET,
        version = env!("CARGO_PKG_VERSION"),
        hash = parser_cache_key(),
    );
    let parser_dir = std::env::temp_dir().join("everest").join("sidecars");
    let parser_path = parser_dir.join(parser_name);

    if parser_path.exists() {
        let metadata = fs::metadata(&parser_path)
            .map_err(|error| format!("Failed to inspect RDL parser sidecar: {error}"))?;
        if metadata.len() == RDL_PARSER_BYTES.len() as u64 {
            return Ok(parser_path);
        }
    }

    fs::create_dir_all(&parser_dir)
        .map_err(|error| format!("Failed to create RDL parser sidecar directory: {error}"))?;
    fs::write(&parser_path, RDL_PARSER_BYTES)
        .map_err(|error| format!("Failed to extract RDL parser sidecar: {error}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&parser_path)
            .map_err(|error| format!("Failed to inspect extracted RDL parser sidecar: {error}"))?
            .permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(&parser_path, permissions)
            .map_err(|error| format!("Failed to make RDL parser sidecar executable: {error}"))?;
    }

    Ok(parser_path)
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
    let parser_path = parser_sidecar_path()?;
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
    let suggestion = save_dialog_suggestion(suggested_path);
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("SystemRDL", &["rdl"])
        .set_file_name(suggestion.file_name);
    if let Some(directory) = suggestion.directory {
        dialog = dialog.set_directory(directory);
    }
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    dialog.save_file(move |file_path| {
        let _ = tx.blocking_send(file_path);
    });
    let file_path = rx
        .recv()
        .await
        .ok_or_else(|| "Save dialog closed before returning a result".to_string())?;

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
        .on_window_event(handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_dialog_suggestion_uses_file_names_as_is() {
        assert_eq!(
            save_dialog_suggestion(Some("top.rdl".to_string())),
            SaveDialogSuggestion {
                directory: None,
                file_name: "top.rdl".to_string(),
            }
        );
    }

    #[test]
    fn save_dialog_suggestion_splits_unix_paths() {
        assert_eq!(
            save_dialog_suggestion(Some("/tmp/projects/top.rdl".to_string())),
            SaveDialogSuggestion {
                directory: Some("/tmp/projects".to_string()),
                file_name: "top.rdl".to_string(),
            }
        );
    }

    #[test]
    fn save_dialog_suggestion_splits_windows_paths() {
        assert_eq!(
            save_dialog_suggestion(Some(r"C:\Users\lawjay\Documents\top.rdl".to_string())),
            SaveDialogSuggestion {
                directory: Some(r"C:\Users\lawjay\Documents".to_string()),
                file_name: "top.rdl".to_string(),
            }
        );
    }

    #[test]
    fn save_dialog_suggestion_falls_back_for_empty_names() {
        assert_eq!(
            save_dialog_suggestion(Some(r"C:\Users\lawjay\Documents\".to_string())),
            SaveDialogSuggestion {
                directory: Some(r"C:\Users\lawjay\Documents".to_string()),
                file_name: "untitled.rdl".to_string(),
            }
        );
    }
}
