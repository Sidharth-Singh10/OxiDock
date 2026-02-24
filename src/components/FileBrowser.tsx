import { useState, useEffect, useCallback, useRef, useImperativeHandle } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Backdrop,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import DownloadIcon from "@mui/icons-material/Download";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import FileUploadIcon from "@mui/icons-material/FileUpload";

import type { FileEntry, FilePreview as FilePreviewType } from "../lib/types";
import FilePreview from "./FilePreview";

export interface FileBrowserBackHandle {
  canGoBack: () => boolean;
  handleBack: () => void;
}

interface Props {
  sessionId: string;
  serverName: string;
  onDisconnect: () => void;
  initialPath?: string;
  onBackRef?: React.RefObject<FileBrowserBackHandle | null>;
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

function FileBrowserInner({
  sessionId,
  serverName: _serverName,
  onDisconnect: _onDisconnect,
  initialPath,
  onBackRef,
}: Props) {
  const [path, setPath] = useState(initialPath || "/home");
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

  // FAB States
  const [fabOpen, setFabOpen] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFabToggle = () => setFabOpen(!fabOpen);

  const handleCreateFolderStart = () => {
    setFabOpen(false);
    setNewFolderName("");
    setCreateFolderDialogOpen(true);
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    try {
      const newDirPath = path === "/" ? `/${newFolderName}` : `${path}/${newFolderName}`;
      await invoke("sftp_create_dir", {
        sessionId,
        path: newDirPath,
      });
      setSnackbar("Folder created successfully");
      setCreateFolderDialogOpen(false);
      loadDir(path); // Auto-refresh
    } catch (err) {
      setError(`Failed to create folder: ${err}`);
      setCreateFolderDialogOpen(false); // Close on error too
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleUploadFile = () => {
    setFabOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const buffer = await file.arrayBuffer();
      const remotePath = path === "/" ? `/${file.name}` : `${path}/${file.name}`;

      await invoke("sftp_upload_file", {
        sessionId,
        remotePath,
        data: Array.from(new Uint8Array(buffer)),
      });

      setSnackbar("File uploaded successfully");
      loadDir(path); // Auto-refresh
    } catch (err) {
      setError(`Upload failed: ${err}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset input
      }
    }
  };

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

  // Expose back navigation to parent for Android back gesture
  // At mount point (initialPath) or fs root: back = disconnect. Else: close preview or navigate up.
  const rootPath = (initialPath || "/home").replace(/\/$/, "") || "/";
  const atMountPoint = path.replace(/\/$/, "") === rootPath || path === "/";
  useImperativeHandle(
    onBackRef,
    () => ({
      canGoBack: () => !!preview || (!atMountPoint && pathParts.length > 1),
      handleBack: () => {
        if (preview) setPreview(null);
        else if (!atMountPoint && pathParts.length > 1) {
          const parent = path.split("/").slice(0, -1).join("/") || "/";
          loadDir(parent);
        }
      },
    }),
    [preview, path, pathParts.length, loadDir, atMountPoint, rootPath],
  );

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

      {/* Loading Backdrop */}
      <Backdrop
        open={isUploading || downloading}
        sx={{
          zIndex: 2000,
          flexDirection: 'column',
          gap: 2,
          bgcolor: 'rgba(0, 0, 0, 0.7)'
        }}
      >
        <CircularProgress color="primary" />
        <Typography variant="h6" color="white" fontWeight="500">
          {isUploading ? "Uploading file..." : "Downloading..."}
        </Typography>
      </Backdrop>

      {/* Error Dialog */}
      <Dialog
        open={!!error}
        onClose={() => setError(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ color: "error.main", fontWeight: 600 }}>Action Failed</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "50vh",
              overflowY: "auto",
              fontFamily: "monospace",
              p: 1.5,
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
              borderRadius: 1
            }}
          >
            {error}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setError(null)} variant="contained" color="primary" disableElevation sx={{ borderRadius: 2 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* FAB Backdrop */}
      {fabOpen && (
        <Box
          onClick={() => setFabOpen(false)}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "rgba(0,0,0,0.5)",
            zIndex: 1300,
            transition: "opacity 0.2s ease-in-out",
          }}
        />
      )}

      {/* FAB Options Area */}
      <Box
        sx={{
          position: "fixed",
          bottom: 88, // Pushed closer to the bottom (was 104)
          right: 24,
          zIndex: 1400,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2,
            opacity: fabOpen ? 1 : 0,
            pointerEvents: fabOpen ? "auto" : "none",
            transform: fabOpen ? "translateY(0)" : "translateY(24px)",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <Card
            elevation={4}
            sx={{
              borderRadius: 8,
              bgcolor: "background.paper",
              overflow: "hidden",
            }}
          >
            <ListItemButton onClick={handleCreateFolderStart} sx={{ py: 1.5, px: 2.5 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <CreateNewFolderIcon color="action" />
              </ListItemIcon>
              <ListItemText primary="Folder" primaryTypographyProps={{ fontWeight: 500 }} />
            </ListItemButton>
          </Card>

          <Card
            elevation={4}
            sx={{
              borderRadius: 8,
              bgcolor: "background.paper",
              overflow: "hidden",
            }}
          >
            <ListItemButton onClick={handleUploadFile} sx={{ py: 1.5, px: 2.5 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <FileUploadIcon color="action" />
              </ListItemIcon>
              <ListItemText primary="Upload" primaryTypographyProps={{ fontWeight: 500 }} />
            </ListItemButton>
          </Card>
        </Box>

        <Box
          component="button"
          onClick={handleFabToggle}
          sx={{
            width: 64, // Increased size (was 56)
            height: 64, // Increased size (was 56)
            borderRadius: "20px", // Adjusted for slightly more squircle look
            bgcolor: "primary.main",
            color: "primary.contrastText",
            border: "none",
            outline: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            cursor: "pointer",
            transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:active": {
              transform: fabOpen ? "rotate(45deg) scale(0.95)" : "rotate(0deg) scale(0.95)",
            },
            "&:hover": {
              bgcolor: "primary.dark",
            },
          }}
        >
          <AddIcon sx={{ fontSize: 36 }} /> {/* Increased icon size */}
        </Box>
      </Box>

      {/* Create Folder Dialog */}
      {createFolderDialogOpen && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "rgba(0,0,0,0.5)",
            zIndex: 1500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
          }}
        >
          <Card elevation={8} sx={{ width: "100%", maxWidth: 360, borderRadius: 3 }}>
            <Box component="form" onSubmit={handleCreateFolderSubmit}>
              <CardContent sx={{ pt: 3, pb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  New Folder
                </Typography>
                <input
                  type="text"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginTop: "8px",
                    borderRadius: "8px",
                    border: "1px solid #ccc",
                    outline: "none",
                    fontFamily: "inherit",
                    fontSize: "1rem",
                    backgroundColor: "var(--mui-palette-background-default)",
                    color: "var(--mui-palette-text-primary)",
                  }}
                />
              </CardContent>
              <Box sx={{ display: "flex", justifyContent: "flex-end", px: 2, pb: 2, gap: 1 }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setCreateFolderDialogOpen(false)}
                  disabled={isCreatingFolder}
                  sx={{
                    px: 2,
                    py: 1,
                    border: "none",
                    bgcolor: "transparent",
                    color: "primary.main",
                    fontWeight: 600,
                    cursor: "pointer",
                    borderRadius: 1,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  Cancel
                </Box>
                <Box
                  component="button"
                  type="submit"
                  disabled={!newFolderName.trim() || isCreatingFolder}
                  sx={{
                    px: 2,
                    py: 1,
                    border: "none",
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    fontWeight: 600,
                    cursor: "pointer",
                    borderRadius: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    opacity: (!newFolderName.trim() || isCreatingFolder) ? 0.5 : 1,
                  }}
                >
                  {isCreatingFolder && <CircularProgress size={16} color="inherit" />}
                  Create
                </Box>
              </Box>
            </Box>
          </Card>
        </Box>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />
    </Box>
  );
}

export default FileBrowserInner;
