import { ServerConfig, ViewSettings, FolderSettings } from "./types";

const SERVERS_KEY = "vps-file-browser-servers";
const VIEW_SETTINGS_KEY = "oxidock-view-settings";
const FOLDER_SETTINGS_KEY = "oxidock-folder-settings";
const LAST_FOLDER_KEY = "oxidock-last-folder";

const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  viewMode: "list",
  sortBy: "name",
  zoomLevel: 50,
  onlyThisFolder: false,
};

export function loadViewSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(VIEW_SETTINGS_KEY);
    if (!raw) return DEFAULT_VIEW_SETTINGS;
    return { ...DEFAULT_VIEW_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

export function saveViewSettings(settings: ViewSettings): void {
  localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(settings));
}

const DEFAULT_FOLDER_SETTINGS: FolderSettings = {
  showHiddenFiles: true,
  foldersFirst: true,
  rememberLastFolder: true,
  showFoldersSize: false,
};

export function loadFolderSettings(): FolderSettings {
  try {
    const raw = localStorage.getItem(FOLDER_SETTINGS_KEY);
    if (!raw) return DEFAULT_FOLDER_SETTINGS;
    return { ...DEFAULT_FOLDER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FOLDER_SETTINGS;
  }
}

export function saveFolderSettings(settings: FolderSettings): void {
  localStorage.setItem(FOLDER_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadLastFolder(): string | null {
  try {
    return localStorage.getItem(LAST_FOLDER_KEY);
  } catch {
    return null;
  }
}

export function saveLastFolder(path: string): void {
  localStorage.setItem(LAST_FOLDER_KEY, path);
}

export function loadServers(): ServerConfig[] {
  try {
    const raw = localStorage.getItem(SERVERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveServers(servers: ServerConfig[]): void {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
}

export function addServer(server: ServerConfig): ServerConfig[] {
  const servers = loadServers();
  if (server.isDefault) {
    servers.forEach((s) => (s.isDefault = false));
  }
  servers.push(server);
  saveServers(servers);
  return servers;
}

export function setDefaultServer(id: string | null): ServerConfig[] {
  const servers = loadServers();
  servers.forEach((s) => (s.isDefault = s.id === id));
  saveServers(servers);
  return servers;
}

export function getDefaultServer(): ServerConfig | undefined {
  return loadServers().find((s) => s.isDefault);
}

export function removeServer(id: string): ServerConfig[] {
  const servers = loadServers().filter((s) => s.id !== id);
  saveServers(servers);
  return servers;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
