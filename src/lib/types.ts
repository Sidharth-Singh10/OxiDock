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

export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  keyName: string;
}
