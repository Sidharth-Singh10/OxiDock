/// TypeScript types matching Rust structs for Tauri invoke() calls.

export type KeyType = "Pem" | "Rsa" | "Ecdsa" | "Ed25519";

export interface KeyInfo {
  name: string;
  key_type: KeyType;
  fingerprint: string;
  created_at: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string | null;
  is_image: boolean;
}

export interface ImageCacheEntry {
  localPath: string;   // absolute local path to cached file
  remotePath: string;  // original remote path (cache key)
  cachedAt: number;    // Date.now() timestamp
}

export interface FilePreview {
  content: string;
  is_text: boolean;
  truncated: boolean;
  total_size: number;
}

export interface SessionInfo {
  id: string;
  host: string;
  user: string;
}

export type ViewMode = "list" | "grid" | "compact";
export type SortBy = "name" | "date" | "size" | "type";

export interface ViewSettings {
  viewMode: ViewMode;
  sortBy: SortBy;
  zoomLevel: number;
  onlyThisFolder: boolean;
}

export interface FolderSettings {
  showHiddenFiles: boolean;
  foldersFirst: boolean;
  rememberLastFolder: boolean;
  showFoldersSize: boolean;
}

export type AuthMethod = "key" | "password";

export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  keyName?: string;
  password?: string;
  defaultMountPoint?: string;
  isDefault?: boolean;
}
