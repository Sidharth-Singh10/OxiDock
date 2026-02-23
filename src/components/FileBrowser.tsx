import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Box,
  Breadcrumbs,
  Card,
  CardContent,
  CircularProgress,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import DownloadIcon from "@mui/icons-material/Download";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import type { FileEntry, FilePreview as FilePreviewType } from "../lib/types";
import FilePreview from "./FilePreview";

interface Props {
  sessionId: string;
  serverName: string;
  onDisconnect: () => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "\u2014";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function FileBrowser({
  sessionId,
  serverName: _serverName,
  onDisconnect: _onDisconnect,
}: Props) {
  const [path, setPath] = useState("/home");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    data: FilePreviewType;
    name: string;
  } | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    entry: FileEntry;
    anchorEl: HTMLElement;
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const loadDir = useCallback(
    async (dirPath: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<FileEntry[]>("sftp_list_dir", {
          sessionId,
          path: dirPath,
        });
        setEntries(result);
        setPath(dirPath);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    loadDir(path);
  }, []);

  const handleEntryClick = async (entry: FileEntry) => {
    if (entry.is_dir) {
      await loadDir(entry.path);
    } else {
      try {
        const data = await invoke<FilePreviewType>("sftp_read_file_preview", {
          sessionId,
          path: entry.path,
          maxBytes: 65536,
        });
        setPreview({ data, name: entry.name });
      } catch (e) {
        setError(`Failed to preview: ${e}`);
      }
    }
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (entry: FileEntry, target: HTMLElement) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setContextMenu({ entry, anchorEl: target });
    }, 500);
  };

  const handleDownloadFromMenu = async () => {
    if (!contextMenu) return;
    const entry = contextMenu.entry;
    setContextMenu(null);
    try {
      setDownloading(true);
      const savedPath = await invoke<string>("sftp_save_file", {
        sessionId,
        remotePath: entry.path,
        fileName: entry.name,
      });
      setSnackbar(`Saved to ${savedPath}`);
    } catch (err) {
      setSnackbar(`Download failed: ${err}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleNavigateUp = () => {
    const parent = path.split("/").slice(0, -1).join("/") || "/";
    loadDir(parent);
  };

  // Build breadcrumb segments
  const pathParts = path.split("/").filter(Boolean);

  if (preview) {
    return (
      <FilePreview
        data={preview.data}
        filename={preview.name}
        sessionId={sessionId}
        filePath={
          path.endsWith("/") ? path + preview.name : path + "/" + preview.name
        }
        onBack={() => setPreview(null)}
      />
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Breadcrumb bar */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.default",
          overflow: "auto",
        }}
      >
        <Breadcrumbs
          sx={{
            "& .MuiBreadcrumbs-ol": { flexWrap: "nowrap" },
          }}
        >
          <Link
            component="button"
            underline="hover"
            color="text.secondary"
            onClick={() => loadDir("/")}
            sx={{ fontFamily: "monospace", fontSize: "0.75rem", whiteSpace: "nowrap" }}
          >
            /
          </Link>
          {pathParts.map((part, i) => {
            const fullPath = "/" + pathParts.slice(0, i + 1).join("/");
            const isLast = i === pathParts.length - 1;
            return (
              <Link
                key={fullPath}
                component="button"
                underline="hover"
                color={isLast ? "primary" : "text.secondary"}
                onClick={() => loadDir(fullPath)}
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  fontWeight: isLast ? 600 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                {part}
              </Link>
            );
          })}
        </Breadcrumbs>
      </Box>

      {error && (
        <Card sx={{ m: 1.5, bgcolor: "error.main", color: "error.contrastText" }}>
          <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
            <Typography variant="body2">{error}</Typography>
          </CardContent>
        </Card>
      )}

      {/* File list */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Loading...
            </Typography>
          </Box>
        ) : entries.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 8,
              gap: 1,
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "action.hover",
              }}
            >
              <FolderOpenIcon sx={{ fontSize: 32, color: "text.secondary", opacity: 0.5 }} />
            </Box>
            <Typography variant="body1" color="text.secondary">
              This directory is empty
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {/* Parent directory */}
            {path !== "/" && (
              <ListItem disablePadding>
                <ListItemButton onClick={handleNavigateUp} sx={{ minHeight: 48 }}>
                  <ListItemIcon sx={{ minWidth: 52 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: (theme) => `${theme.palette.warning.main}1a`,
                      }}
                    >
                      <FolderOpenIcon sx={{ fontSize: 22, color: "warning.main" }} />
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" color="text.secondary">
                        ..
                      </Typography>
                    }
                  />
                </ListItemButton>
              </ListItem>
            )}

            {entries.map((entry) => (
              <ListItem key={entry.path} disablePadding>
                <ListItemButton
                  onClick={() => {
                    if (longPressTriggered.current) return;
                    handleEntryClick(entry);
                  }}
                  onMouseDown={(e) => startLongPress(entry, e.currentTarget)}
                  onMouseUp={clearLongPress}
                  onMouseLeave={clearLongPress}
                  onTouchStart={(e) => startLongPress(entry, e.currentTarget)}
                  onTouchEnd={clearLongPress}
                  onTouchCancel={clearLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ entry, anchorEl: e.currentTarget });
                  }}
                  sx={{ minHeight: 48 }}
                >
                  <ListItemIcon sx={{ minWidth: 52 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: (theme) => entry.is_dir
                          ? `${theme.palette.warning.main}1a`
                          : `${theme.palette.info.main}1a`,
                      }}
                    >
                      {entry.is_dir ? (
                        <FolderIcon sx={{ fontSize: 22, color: "warning.main" }} />
                      ) : (
                        <InsertDriveFileIcon sx={{ fontSize: 22, color: "info.main" }} />
                      )}
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        fontWeight={entry.is_dir ? 600 : 400}
                        noWrap
                      >
                        {entry.name}
                      </Typography>
                    }
                    secondary={
                      <Stack direction="row" spacing={2} component="span">
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          fontFamily="monospace"
                        >
                          {entry.is_dir ? "dir" : formatSize(entry.size)}
                        </Typography>
                        {entry.modified && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                          >
                            {new Date(entry.modified).toLocaleDateString()}
                          </Typography>
                        )}
                      </Stack>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Menu
        open={!!contextMenu}
        anchorEl={contextMenu?.anchorEl}
        onClose={() => setContextMenu(null)}
        anchorOrigin={{ vertical: "center", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <MenuItem onClick={handleDownloadFromMenu} disabled={downloading}>
          <DownloadIcon fontSize="small" sx={{ mr: 1.5 }} />
          {downloading ? "Downloading..." : "Download"}
        </MenuItem>
      </Menu>

      {downloading && (
        <Box sx={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 1400 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
    </Box>
  );
}
