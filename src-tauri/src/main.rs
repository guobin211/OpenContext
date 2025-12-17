// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use opencontext_core::{EnvOverrides, OpenContext};
use opencontext_core::events::{create_event_bus, SharedEventBus};
use opencontext_core::search::{
    Indexer, IndexStats, IndexSyncService, SearchConfig, SearchOptions, SearchResults, Searcher,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, State};
use tokio::sync::Mutex as AsyncMutex;

struct AppState {
    ctx: Mutex<OpenContext>,
    searcher: AsyncMutex<Option<Searcher>>,
    indexer: AsyncMutex<Option<Indexer>>,
    search_config: SearchConfig,
    #[allow(dead_code)]
    event_bus: SharedEventBus,
}

// Tauri command 返回结果类型
type CmdResult<T> = Result<T, String>;

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ===== Folder Commands =====

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListFoldersOptions {
    all: Option<bool>,
}

#[tauri::command]
fn list_folders(
    state: State<AppState>,
    options: Option<ListFoldersOptions>,
) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let folders = ctx
        .list_folders(options.and_then(|o| o.all).unwrap_or(false))
        .map_err(map_err)?;
    serde_json::to_value(&folders).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateFolderOptions {
    path: String,
    description: Option<String>,
}

#[tauri::command]
fn create_folder(state: State<AppState>, options: CreateFolderOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let folder = ctx
        .create_folder(&options.path, options.description.as_deref())
        .map_err(map_err)?;
    serde_json::to_value(&folder).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameFolderOptions {
    path: String,
    new_name: String,
}

#[tauri::command]
fn rename_folder(state: State<AppState>, options: RenameFolderOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let folder = ctx
        .rename_folder(&options.path, &options.new_name)
        .map_err(map_err)?;
    serde_json::to_value(&folder).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveFolderOptions {
    path: String,
    dest_folder_path: String,
}

#[tauri::command]
fn move_folder(state: State<AppState>, options: MoveFolderOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let folder = ctx
        .move_folder(&options.path, &options.dest_folder_path)
        .map_err(map_err)?;
    serde_json::to_value(&folder).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveFolderOptions {
    path: String,
    force: Option<bool>,
}

#[tauri::command]
fn remove_folder(state: State<AppState>, options: RemoveFolderOptions) -> CmdResult<bool> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    ctx.remove_folder(&options.path, options.force.unwrap_or(false))
        .map_err(map_err)?;
    Ok(true)
}

// ===== Document Commands =====

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListDocsOptions {
    folder_path: String,
    recursive: Option<bool>,
}

#[tauri::command]
fn list_docs(state: State<AppState>, options: ListDocsOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let docs = ctx
        .list_docs(&options.folder_path, options.recursive.unwrap_or(false))
        .map_err(map_err)?;
    serde_json::to_value(&docs).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateDocOptions {
    folder_path: String,
    name: String,
    description: Option<String>,
}

#[tauri::command]
fn create_doc(state: State<AppState>, options: CreateDocOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let doc = ctx
        .create_doc(&options.folder_path, &options.name, options.description.as_deref())
        .map_err(map_err)?;
    serde_json::to_value(&doc).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveDocOptions {
    doc_path: String,
    dest_folder_path: String,
}

#[tauri::command]
fn move_doc(state: State<AppState>, options: MoveDocOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let doc = ctx
        .move_doc(&options.doc_path, &options.dest_folder_path)
        .map_err(map_err)?;
    serde_json::to_value(&doc).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameDocOptions {
    doc_path: String,
    new_name: String,
}

#[tauri::command]
fn rename_doc(state: State<AppState>, options: RenameDocOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let doc = ctx
        .rename_doc(&options.doc_path, &options.new_name)
        .map_err(map_err)?;
    serde_json::to_value(&doc).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveDocOptions {
    doc_path: String,
}

#[tauri::command]
fn remove_doc(state: State<AppState>, options: RemoveDocOptions) -> CmdResult<bool> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    ctx.remove_doc(&options.doc_path).map_err(map_err)?;
    Ok(true)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetDescriptionOptions {
    doc_path: String,
    description: String,
}

#[tauri::command]
fn set_doc_description(
    state: State<AppState>,
    options: SetDescriptionOptions,
) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let doc = ctx
        .set_doc_description(&options.doc_path, &options.description)
        .map_err(map_err)?;
    serde_json::to_value(&doc).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetDocContentOptions {
    path: String,
}

#[derive(Serialize)]
struct DocContentResponse {
    content: String,
}

#[tauri::command]
fn get_doc_content(state: State<AppState>, options: GetDocContentOptions) -> CmdResult<DocContentResponse> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let content = ctx.get_doc_content(&options.path).map_err(map_err)?;
    Ok(DocContentResponse { content })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDocOptions {
    path: String,
    content: String,
    description: Option<String>,
}

#[tauri::command]
fn save_doc_content(state: State<AppState>, options: SaveDocOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let doc = ctx
        .save_doc_content(&options.path, &options.content, options.description.as_deref())
        .map_err(map_err)?;
    serde_json::to_value(&doc).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetDocByIdOptions {
    stable_id: String,
}

#[tauri::command]
fn get_doc_by_id(state: State<AppState>, options: GetDocByIdOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let doc = ctx.get_doc_by_stable_id(&options.stable_id).map_err(map_err)?;
    serde_json::to_value(&doc).map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetDocMetaOptions {
    path: String,
}

#[tauri::command]
fn get_doc_meta(state: State<AppState>, options: GetDocMetaOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let doc = ctx.get_doc_meta(&options.path).map_err(map_err)?;
    serde_json::to_value(&doc).map_err(map_err)
}

// ===== Manifest Command =====

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestOptions {
    folder_path: String,
    limit: Option<u32>,
}

#[tauri::command]
fn generate_manifest(state: State<AppState>, options: ManifestOptions) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let manifest = ctx
        .generate_manifest(&options.folder_path, options.limit.map(|v| v as usize))
        .map_err(map_err)?;
    serde_json::to_value(&manifest).map_err(map_err)
}

// ===== Environment Info Command =====

#[tauri::command]
fn get_env_info(state: State<AppState>) -> CmdResult<serde_json::Value> {
    let ctx = state.ctx.lock().map_err(map_err)?;
    let base_info = ctx.env_info();
    let config = &state.search_config;
    
    // Mask API key for security (show only last 4 chars)
    let masked_api_key = config.embedding.api_key.as_ref().map(|key| {
        if key.len() > 4 {
            format!("{}...{}", &key[..3], &key[key.len()-4..])
        } else {
            "****".to_string()
        }
    });
    
    let info = serde_json::json!({
        "contexts_root": base_info.contexts_root,
        "db_path": base_info.db_path,
        "embedding_model": config.embedding.model,
        "embedding_api_base": config.embedding.api_base,
        "api_key_masked": masked_api_key,
        "has_api_key": config.embedding.api_key.is_some() && !config.embedding.api_key.as_ref().unwrap().is_empty(),
        "config_path": SearchConfig::json_config_path().to_string_lossy(),
        "dimensions": config.embedding.dimensions,
    });
    
    Ok(info)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveConfigOptions {
    api_key: Option<String>,
    api_base: Option<String>,
    model: Option<String>,
}

#[tauri::command]
fn save_config(options: SaveConfigOptions) -> CmdResult<serde_json::Value> {
    use std::collections::HashMap;
    
    let config_path = SearchConfig::json_config_path();
    
    // Read existing config or create new
    let mut config: HashMap<String, serde_json::Value> = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(map_err)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        HashMap::new()
    };
    
    // Update only provided fields (use new naming convention)
    if let Some(key) = options.api_key {
        if !key.is_empty() {
            config.insert("EMBEDDING_API_KEY".to_string(), serde_json::Value::String(key));
            // Remove legacy key if it exists
            config.remove("OPENAI_API_KEY");
        }
    }
    if let Some(base) = options.api_base {
        config.insert("EMBEDDING_API_BASE".to_string(), serde_json::Value::String(base));
        // Remove legacy key if it exists
        config.remove("OPENAI_BASE_URL");
    }
    if let Some(model) = options.model {
        config.insert("EMBEDDING_MODEL".to_string(), serde_json::Value::String(model));
    }
    
    // Ensure directory exists
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(map_err)?;
    }
    
    // Write config
    let content = serde_json::to_string_pretty(&config).map_err(map_err)?;
    std::fs::write(&config_path, content).map_err(map_err)?;
    
    Ok(serde_json::json!({
        "success": true,
        "config_path": config_path.to_string_lossy()
    }))
}

// ===== Search Commands =====

#[tauri::command]
async fn semantic_search(
    state: State<'_, AppState>,
    options: SearchOptions,
) -> CmdResult<SearchResults> {
    let mut searcher_guard = state.searcher.lock().await;
    
    // Initialize searcher if not already done
    if searcher_guard.is_none() {
        let searcher = Searcher::new(state.search_config.clone())
            .await
            .map_err(map_err)?;
        *searcher_guard = Some(searcher);
    }
    
    let searcher = searcher_guard.as_ref().unwrap();
    searcher.search(options).await.map_err(map_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct BuildIndexOptions {
    folder_path: Option<String>,
}

#[tauri::command]
async fn build_search_index(
    window: tauri::Window,
    state: State<'_, AppState>,
    _options: Option<BuildIndexOptions>,
) -> CmdResult<IndexStats> {
    // Get contexts_root from OpenContext
    let contexts_root = {
        let ctx = state.ctx.lock().map_err(map_err)?;
        ctx.env_info().contexts_root
    };

    // Get all documents
    let docs = {
        let ctx = state.ctx.lock().map_err(map_err)?;
        // List all folders first
        let folders = ctx.list_folders(true).map_err(map_err)?;
        let mut all_docs = Vec::new();
        for folder in folders {
            if let Ok(docs) = ctx.list_docs(&folder.rel_path, false) {
                all_docs.extend(docs);
            }
        }
        all_docs
    };

    let mut indexer_guard = state.indexer.lock().await;
    
    // Initialize indexer if not already done
    if indexer_guard.is_none() {
        let indexer = Indexer::new(state.search_config.clone(), contexts_root)
            .await
            .map_err(map_err)?;
        *indexer_guard = Some(indexer);
    }
    
    let indexer = indexer_guard.as_mut().unwrap();
    
    // Build with progress callback
    let result = indexer.build_all_with_progress(docs, |progress| {
        // Emit progress event to frontend
        let _ = window.emit("index-progress", &progress);
    }).await.map_err(map_err)?;
    
    // Save index metadata with last update time
    let metadata_path = state.search_config.paths.get_index_metadata_path();
    let metadata = serde_json::json!({
        "lastFullBuild": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        "totalChunks": result.total_chunks,
        "totalDocs": result.total_docs,
    });
    if let Some(parent) = metadata_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&metadata_path, serde_json::to_string_pretty(&metadata).unwrap_or_default());
    
    Ok(result)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexStatus {
    exists: bool,
    chunk_count: usize,
    last_updated: Option<u64>,
}

#[tauri::command]
async fn get_index_status(state: State<'_, AppState>) -> CmdResult<IndexStatus> {
    // Get contexts_root from OpenContext
    let contexts_root = {
        let ctx = state.ctx.lock().map_err(map_err)?;
        ctx.env_info().contexts_root
    };

    let mut indexer_guard = state.indexer.lock().await;
    
    if indexer_guard.is_none() {
        let indexer = Indexer::new(state.search_config.clone(), contexts_root)
            .await
            .map_err(map_err)?;
        *indexer_guard = Some(indexer);
    }
    
    let indexer = indexer_guard.as_ref().unwrap();
    let exists = indexer.index_exists().await;
    let stats = indexer.get_stats().await.map_err(map_err)?;
    
    // Try to read last update time from index-metadata.json
    // Prefer lastUpdated (any update), fallback to lastFullBuild (full rebuild only)
    let last_updated = {
        let metadata_path = state.search_config.paths.get_index_metadata_path();
        if metadata_path.exists() {
            std::fs::read_to_string(&metadata_path)
                .ok()
                .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
                .and_then(|v| {
                    v.get("lastUpdated").and_then(|x| x.as_u64())
                        .or_else(|| v.get("lastFullBuild").and_then(|x| x.as_u64()))
                })
        } else {
            None
        }
    };
    
    Ok(IndexStatus {
        exists,
        chunk_count: stats.total_chunks,
        last_updated,
    })
}

#[tauri::command]
async fn clean_search_index(state: State<'_, AppState>) -> CmdResult<bool> {
    // Get contexts_root from OpenContext
    let contexts_root = {
        let ctx = state.ctx.lock().map_err(map_err)?;
        ctx.env_info().contexts_root
    };

    let mut indexer_guard = state.indexer.lock().await;
    
    if indexer_guard.is_none() {
        let indexer = Indexer::new(state.search_config.clone(), contexts_root)
            .await
            .map_err(map_err)?;
        *indexer_guard = Some(indexer);
    }
    
    let indexer = indexer_guard.as_mut().unwrap();
    indexer.clean().await.map_err(map_err)?;
    
    Ok(true)
}

fn main() {
    // Create event bus for document lifecycle events
    let event_bus = create_event_bus();

    // Initialize OpenContext with event bus
    let ctx = OpenContext::initialize(EnvOverrides::default())
        .expect("failed to initialize OpenContext core")
        .with_event_bus(event_bus.clone());

    let search_config = SearchConfig::load().unwrap_or_default();
    let contexts_root = ctx.env_info().contexts_root.clone();

    // Clone for setup hook
    let sync_event_bus = event_bus.clone();
    let sync_config = search_config.clone();
    let sync_contexts_root = contexts_root.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            ctx: Mutex::new(ctx),
            searcher: AsyncMutex::new(None),
            indexer: AsyncMutex::new(None),
            search_config,
            event_bus,
        })
        .setup(move |_app| {
            // Start index sync service in background
            // Use tauri::async_runtime::spawn which works with Tauri's runtime management
            tauri::async_runtime::spawn(async move {
                let sync_service = IndexSyncService::new(sync_config, sync_contexts_root);
                if let Err(e) = sync_service.start(sync_event_bus).await {
                    log::error!("[IndexSync] Service error: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Folder commands
            list_folders,
            create_folder,
            rename_folder,
            move_folder,
            remove_folder,
            // Document commands
            list_docs,
            create_doc,
            get_doc_by_id,
            get_doc_meta,
            move_doc,
            rename_doc,
            remove_doc,
            set_doc_description,
            get_doc_content,
            save_doc_content,
            // Utility commands
            generate_manifest,
            get_env_info,
            save_config,
            // Search commands
            semantic_search,
            build_search_index,
            get_index_status,
            clean_search_index,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
