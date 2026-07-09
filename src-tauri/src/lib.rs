use serde::{Deserialize, Serialize};
use std::{
    collections::hash_map::DefaultHasher,
    fs::{self, OpenOptions},
    hash::{Hash, Hasher},
    io::Write,
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RdlParseError {
    kind: &'static str,
    path: String,
    message: String,
    line: Option<u32>,
    column: Option<u32>,
    snippet: Option<String>,
    details: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
enum OpenRdlFileError {
    RdlParse(RdlParseError),
    Message(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticLogResult {
    path: String,
    content: String,
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

fn write_rdl_file(path: impl AsRef<Path>, content: impl AsRef<[u8]>) -> Result<(), String> {
    let path = path.as_ref();
    fs::write(path, content).map_err(|error| {
        format!(
            "Failed to write RDL file at {path}: {error}",
            path = path.display()
        )
    })
}

fn diagnostics_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join("diagnostics")
        .join("everest.log"))
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create diagnostics directory at {path}: {error}",
                path = parent.display()
            )
        })?;
    }
    Ok(())
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

fn parse_rdl_stderr(file_path: &str, stderr: &str) -> RdlParseError {
    let trimmed = stderr.trim();
    let mut message = "Failed to parse RDL file.".to_string();
    let mut line = None;
    let mut column = None;
    let mut snippet = None;

    let lines: Vec<&str> = trimmed.lines().collect();
    for (index, text) in lines.iter().enumerate() {
        let Some(rest) = text.strip_prefix(file_path) else {
            continue;
        };
        let Some(rest) = rest.strip_prefix(':') else {
            continue;
        };
        let mut parts = rest.splitn(4, ':');
        let parsed_line = parts.next().and_then(|value| value.parse::<u32>().ok());
        let parsed_column = parts.next().and_then(|value| value.parse::<u32>().ok());
        let severity = parts.next().map(str::trim);
        let parsed_message = parts.next().map(str::trim);

        if !matches!(severity, Some("error" | "fatal")) {
            continue;
        }

        line = parsed_line;
        column = parsed_column;
        if let Some(parsed_message) = parsed_message {
            if !parsed_message.is_empty() {
                message = parsed_message.to_string();
            }
        }

        if let Some(source_line) = lines.get(index + 1) {
            let mut snippet_lines = vec![(*source_line).to_string()];
            if let Some(caret_line) = lines.get(index + 2) {
                if caret_line.trim_start().starts_with('^') {
                    snippet_lines.push((*caret_line).to_string());
                }
            }
            snippet = Some(snippet_lines.join("\n"));
        }
        break;
    }

    if message == "Failed to parse RDL file." && !trimmed.is_empty() {
        message = trimmed.lines().next().unwrap_or(&message).to_string();
    }

    RdlParseError {
        kind: "rdlParseError",
        path: file_path.to_string(),
        message,
        line,
        column,
        snippet,
        details: if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        },
    }
}

fn run_parser_sidecar(parser_path: &Path, file_path: &str) -> Result<Vec<u8>, OpenRdlFileError> {
    let mut command = Command::new(parser_path);
    command.arg(file_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command.output().map_err(|error| {
        OpenRdlFileError::Message(format!(
            "Failed to run RDL parser sidecar at {parser_path:?}: {error}"
        ))
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            OpenRdlFileError::Message(format!(
                "RDL parser sidecar at {parser_path:?} exited with {status}",
                status = output.status
            ))
        } else {
            OpenRdlFileError::RdlParse(parse_rdl_stderr(file_path, &stderr))
        });
    }

    Ok(output.stdout)
}

async fn parse_rdl_file(file_path: String) -> Result<ParsedRdlFile, OpenRdlFileError> {
    let parser_path = parser_sidecar_path().map_err(OpenRdlFileError::Message)?;
    let stdout = tauri::async_runtime::spawn_blocking(move || {
        run_parser_sidecar(&parser_path, file_path.as_str())
    })
    .await
    .map_err(|error| {
        OpenRdlFileError::Message(format!("Failed to join RDL parser task: {error}"))
    })??;

    serde_json::from_slice(&stdout).map_err(|error| {
        OpenRdlFileError::Message(format!("RDL parser returned invalid JSON: {error}"))
    })
}

#[tauri::command]
async fn open_rdl_file(app: AppHandle) -> Result<Option<ParsedRdlFile>, OpenRdlFileError> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("SystemRDL", &["rdl"])
        .blocking_pick_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };

    let file_path = file_path_to_string(file_path).map_err(OpenRdlFileError::Message)?;
    parse_rdl_file(file_path).await.map(Some)
}

#[tauri::command]
async fn save_rdl_file(path: String, content: String) -> Result<(), String> {
    write_rdl_file(path, content)
}

async fn choose_save_path(
    app: AppHandle,
    suggested_path: Option<String>,
) -> Result<Option<String>, String> {
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

    Ok(Some(ensure_rdl_extension(&file_path_to_string(file_path)?)))
}

#[tauri::command]
async fn choose_save_rdl_file(
    app: AppHandle,
    suggested_path: Option<String>,
) -> Result<Option<SaveResult>, String> {
    Ok(choose_save_path(app, suggested_path)
        .await?
        .map(|path| SaveResult { path }))
}

#[tauri::command]
async fn save_rdl_file_as(
    app: AppHandle,
    content: String,
    suggested_path: Option<String>,
) -> Result<Option<SaveResult>, String> {
    let Some(file_path) = choose_save_path(app, suggested_path).await? else {
        return Ok(None);
    };

    write_rdl_file(&file_path, content)?;
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
async fn append_diagnostic_log(app: AppHandle, entry: serde_json::Value) -> Result<(), String> {
    let path = diagnostics_log_path(&app)?;
    ensure_parent_dir(&path)?;
    let line = serde_json::to_string(&entry)
        .map_err(|error| format!("Failed to encode diagnostics entry: {error}"))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| {
            format!(
                "Failed to open diagnostics log at {path}: {error}",
                path = path.display()
            )
        })?;
    writeln!(file, "{line}").map_err(|error| {
        format!(
            "Failed to write diagnostics log at {path}: {error}",
            path = path.display()
        )
    })
}

#[tauri::command]
async fn read_diagnostic_logs(app: AppHandle) -> Result<DiagnosticLogResult, String> {
    let path = diagnostics_log_path(&app)?;
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => {
            return Err(format!(
                "Failed to read diagnostics log at {path}: {error}",
                path = path.display()
            ));
        }
    };

    Ok(DiagnosticLogResult {
        path: path.to_string_lossy().into_owned(),
        content,
    })
}

#[tauri::command]
async fn clear_diagnostic_logs(app: AppHandle) -> Result<DiagnosticLogResult, String> {
    let path = diagnostics_log_path(&app)?;
    ensure_parent_dir(&path)?;
    fs::write(&path, "").map_err(|error| {
        format!(
            "Failed to clear diagnostics log at {path}: {error}",
            path = path.display()
        )
    })?;

    Ok(DiagnosticLogResult {
        path: path.to_string_lossy().into_owned(),
        content: String::new(),
    })
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
            choose_save_rdl_file,
            save_rdl_file_as,
            set_document_edited,
            set_window_title,
            append_diagnostic_log,
            read_diagnostic_logs,
            clear_diagnostic_logs,
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

    #[test]
    fn ensure_rdl_extension_appends_missing_extension() {
        assert_eq!(ensure_rdl_extension("/tmp/top"), "/tmp/top.rdl");
    }

    #[test]
    fn ensure_rdl_extension_keeps_existing_extension() {
        assert_eq!(ensure_rdl_extension("/tmp/top.rdl"), "/tmp/top.rdl");
    }

    #[test]
    fn parse_rdl_stderr_extracts_location_message_and_snippet() {
        let path = "/tmp/bad.rdl";
        let error = parse_rdl_stderr(
            path,
            "/tmp/bad.rdl:3:1: error: extraneous input '}' expecting ';'\n};\n^\nfatal: Parse aborted due to previous errors",
        );

        assert_eq!(error.kind, "rdlParseError");
        assert_eq!(error.path, path);
        assert_eq!(error.message, "extraneous input '}' expecting ';'");
        assert_eq!(error.line, Some(3));
        assert_eq!(error.column, Some(1));
        assert_eq!(error.snippet, Some("};\n^".to_string()));
    }

    #[test]
    fn parse_rdl_stderr_extracts_fatal_location_message_and_snippet() {
        let path = "/home/lomzem/foo.rdl";
        let error = parse_rdl_stderr(
            path,
            "/home/lomzem/foo.rdl:9:2: fatal: Type 'efault' is not defined\n    efault regwidth = 8;\n    ^^^^^^",
        );

        assert_eq!(error.kind, "rdlParseError");
        assert_eq!(error.path, path);
        assert_eq!(error.message, "Type 'efault' is not defined");
        assert_eq!(error.line, Some(9));
        assert_eq!(error.column, Some(2));
        assert_eq!(
            error.snippet,
            Some("    efault regwidth = 8;\n    ^^^^^^".to_string())
        );
    }

    #[test]
    fn parse_rdl_stderr_falls_back_to_first_line_without_location() {
        let error = parse_rdl_stderr("/tmp/bad.rdl", "fatal: Parse aborted");

        assert_eq!(error.message, "fatal: Parse aborted");
        assert_eq!(error.line, None);
        assert_eq!(error.column, None);
        assert_eq!(error.snippet, None);
        assert_eq!(error.details, Some("fatal: Parse aborted".to_string()));
    }
}
