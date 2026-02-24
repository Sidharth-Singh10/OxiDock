import { ServerConfig } from "./types";

const SERVERS_KEY = "vps-file-browser-servers";

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
