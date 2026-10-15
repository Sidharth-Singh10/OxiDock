import { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Box,
  Breadcrumbs,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Divider,
  Fab,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
  Backdrop,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FolderIcon from "@mui/icons-material/Folder";
import DownloadIcon from "@mui/icons-material/Download";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import FileUploadIcon from "@mui/icons-material/FileUpload";

import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import type { FileEntry, FilePreview as FilePreviewType, ViewSettings, FolderSettings } from "../lib/types";
import { getDirCached, getDirCachedCount, setDirCached, invalidateDirCache, prefetchChildren } from "../lib/dirCache";
import { saveLastFolder } from "../lib/storage";
import ImageIcon from "@mui/icons-material/Image";
import FilePreview from "./FilePreview";
import ImageViewer from "./ImageViewer";
import EmptyState from "./EmptyState";

export interface FileBrowserBackHandle {
  canGoBack: () => boolean;
  handleBack: () => void;
}

/** Resolve a palette path like "warning.main" to its color string. */
function paletteColor(theme: Theme, path: string): string {
  const resolved = path.split(".").reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
    theme.palette as unknown,
  );
  return typeof resolved === "string" ? resolved : theme.palette.text.primary;
}

/** Rounded-square tinted tile used for entry icons. */
function IconTile({
  size,
  color,
  children,
}: {
  size: number;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${Math.round(size * 0.3)}px`,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        color,
        bgcolor: (t) => alpha(paletteColor(t, color), 0.1),
        "& .MuiSvgIcon-root": { fontSize: Math.round(size * 0.55) },
      }}
    >
      {children}
    </Box>
  );
}

/** Layout-shaped loading placeholder for cold directory loads. */
function ListSkeleton({
  viewMode,
  iconSize,
  itemHeight,
  gridCardSize,
}: {
  viewMode: ViewSettings["viewMode"];
  iconSize: number;
  itemHeight: number;
  gridCardSize: number;
}) {
  const widths = ["58%", "72%", "46%", "64%", "52%", "78%", "42%", "68%"];

  if (viewMode === "grid") {
    return (
      <Box
        aria-busy="true"
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${gridCardSize}px, 1fr))`,
          gap: 1,
          p: 1.5,
        }}
      >
        {widths.slice(0, 6).map((_, i) => (
          <Box
            key={i}
            sx={{
              borderRadius: (t) => t.tokens.radius.md,
              border: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
              p: 1.5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Skeleton
              variant="rounded"
              width={Math.round(gridCardSize * 0.35)}
              height={Math.round(gridCardSize * 0.35)}
              sx={{ borderRadius: "30%" }}
            />
            <Skeleton variant="text" width="70%" height={14} />
            <Skeleton variant="text" width="40%" height={12} />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <List dense disablePadding aria-busy="true">
      {widths.map((w, i) => (
        <ListItem key={i} disablePadding>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              width: "100%",
              px: 2,
              minHeight: itemHeight,
            }}
          >
            <Skeleton
              variant="rounded"
              width={iconSize}
              height={iconSize}
              sx={{ borderRadius: "30%", flexShrink: 0 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton variant="text" width={w} height={14} />
              {viewMode !== "compact" && (
                <Skeleton variant="text" width="30%" height={12} sx={{ mt: 0.5 }} />
              )}
            </Box>
          </Box>
        </ListItem>
      ))}
    </List>
  );
}

interface Props {
  sessionId: string;
  serverName: string;
  onDisconnect: () => void;
  initialPath?: string;
  onBackRef?: React.RefObject<FileBrowserBackHandle | null>;
  viewSettings: ViewSettings;
  folderSettings: FolderSettings;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function sortEntries(
  entries: FileEntry[],
  sortBy: ViewSettings["sortBy"],
  foldersFirst: boolean,
): FileEntry[] {
  const cmp = (a: FileEntry, b: FileEntry): number => {
    switch (sortBy) {
      case "name":
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      case "date": {
        const ta = a.modified ? new Date(a.modified).getTime() : 0;
        const tb = b.modified ? new Date(b.modified).getTime() : 0;
        return tb - ta;
      }
      case "size":
        return b.size - a.size;
      case "type": {
        const ea = getExtension(a.name);
        const eb = getExtension(b.name);
        return ea.localeCompare(eb) || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      }
    }
  };

  if (foldersFirst) {
    const dirs = entries.filter((e) => e.is_dir);
    const files = entries.filter((e) => !e.is_dir);
    dirs.sort(cmp);
    files.sort(cmp);
    return [...dirs, ...files];
  }

  const sorted = [...entries];
  sorted.sort(cmp);
  return sorted;
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

function formatDirLabel(entry: FileEntry, showSize: boolean): string {
  if (!showSize) return "dir";
  const count = getDirCachedCount(entry.path);
  if (count === null) return "dir";
  return count === 1 ? "1 item" : `${count} items`;
}

function FileBrowserInner({
  sessionId,
  initialPath,
  onBackRef,
  viewSettings,
  folderSettings,
}: Props) {
  const [path, setPath] = useState(initialPath || "/home");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    data: FilePreviewType;
    name: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Image viewer state
  const [imageViewer, setImageViewer] = useState<{
    images: FileEntry[];
    index: number;
  } | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    entry: FileEntry;
    anchorEl: HTMLElement;
  } | null>(null);

  // Confirm delete dialog
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // FAB States
  const [fabOpen, setFabOpen] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPathRef = useRef(path);

  const visibleEntries = useMemo(() => {
    if (folderSettings.showHiddenFiles) return entries;
    return entries.filter((e) => !e.name.startsWith("."));
  }, [entries, folderSettings.showHiddenFiles]);

  const sortedEntries = useMemo(
    () => sortEntries(visibleEntries, viewSettings.sortBy, folderSettings.foldersFirst),
    [visibleEntries, viewSettings.sortBy, folderSettings.foldersFirst],
  );

  // Zoom-derived dimensions
  const iconSize = Math.round(32 + (viewSettings.zoomLevel / 100) * 24); // 32px – 56px
  const itemHeight = Math.round(40 + (viewSettings.zoomLevel / 100) * 24); // 40px – 64px
  const gridCardSize = Math.round(100 + (viewSettings.zoomLevel / 100) * 80); // 100px – 180px

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
      invalidateDirCache(path);
      loadDir(path);
    } catch (err) {
      setError(`Failed to create folder: ${err}`);
      setCreateFolderDialogOpen(false);
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
      invalidateDirCache(path);
      loadDir(path);
    } catch (err) {
      setError(`Upload failed: ${err}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const folderSettingsRef = useRef(folderSettings);
  folderSettingsRef.current = folderSettings;

  const loadDir = useCallback(
    async (dirPath: string) => {
      if (folderSettingsRef.current.rememberLastFolder) {
        saveLastFolder(dirPath);
      }

      const cached = getDirCached(dirPath);
      if (cached) {
        setEntries(cached);
        setPath(dirPath);
        setError(null);
        currentPathRef.current = dirPath;

        invoke<FileEntry[]>("sftp_list_dir", { sessionId, path: dirPath })
          .then((result) => {
            setDirCached(dirPath, result);
            if (currentPathRef.current === dirPath) {
              setEntries(result);
            }
            prefetchChildren(result, sessionId);
          })
          .catch(() => {});
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await invoke<FileEntry[]>("sftp_list_dir", {
          sessionId,
          path: dirPath,
        });
        setDirCached(dirPath, result);
        setEntries(result);
        setPath(dirPath);
        currentPathRef.current = dirPath;
        prefetchChildren(result, sessionId);
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

  // ─── Entry click ─────────────────────────────────────────────────────────
  const handleEntryClick = async (entry: FileEntry) => {
    if (entry.is_dir) {
      await loadDir(entry.path);
    } else if (entry.is_image) {
      const imageEntries = sortedEntries.filter((e) => e.is_image);
      const idx = imageEntries.findIndex((e) => e.path === entry.path);
      setImageViewer({ images: imageEntries, index: idx >= 0 ? idx : 0 });
    } else {
      setPreviewLoading(entry.name);
      try {
        const data = await invoke<FilePreviewType>("sftp_read_file_preview", {
          sessionId,
          path: entry.path,
          maxBytes: 65536,
        });
        setPreview({ data, name: entry.name });
      } catch (e) {
        setError(`Failed to preview: ${e}`);
      } finally {
        setPreviewLoading(null);
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

  // ─── Context menu handlers ────────────────────────────────────────────────

  const handleOpenFromMenu = () => {
    if (!contextMenu) return;
    const entry = contextMenu.entry;
    setContextMenu(null);
    handleEntryClick(entry);
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

  const handleDeleteFromMenu = () => {
    if (!contextMenu) return;
    setDeleteTarget(contextMenu.entry);
    setContextMenu(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await invoke("sftp_delete_file", {
        sessionId,
        path: deleteTarget.path,
        isDir: deleteTarget.is_dir,
      });
      setSnackbar(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      invalidateDirCache(path);
      loadDir(path);
    } catch (err) {
      setError(`Delete failed: ${err}`);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNavigateUp = () => {
    const parent = path.split("/").slice(0, -1).join("/") || "/";
    loadDir(parent);
  };

  // Build breadcrumb segments
  const pathParts = path.split("/").filter(Boolean);

  // Back navigation
  const rootPath = (initialPath || "/home").replace(/\/$/, "") || "/";
  const atMountPoint = path.replace(/\/$/, "") === rootPath || path === "/";
  useImperativeHandle(
    onBackRef,
    () => ({
      canGoBack: () => !!imageViewer || !!previewLoading || !!preview || (!atMountPoint && pathParts.length > 1),
      handleBack: () => {
        if (imageViewer) setImageViewer(null);
        else if (previewLoading) setPreviewLoading(null);
        else if (preview) setPreview(null);
        else if (!atMountPoint && pathParts.length > 1) {
          const parent = path.split("/").slice(0, -1).join("/") || "/";
          loadDir(parent);
        }
      },
    }),
    [imageViewer, previewLoading, preview, path, pathParts.length, loadDir, atMountPoint, rootPath],
  );

  // ─── Image viewer overlay ─────────────────────────────────────────────────
  if (imageViewer) {
    return (
      <ImageViewer
        sessionId={sessionId}
        images={imageViewer.images}
        initialIndex={imageViewer.index}
        onClose={() => setImageViewer(null)}
      />
    );
  }

  if (previewLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          gap: 1.5,
          opacity: 0.7,
        }}
      >
        <CircularProgress size={24} thickness={3} />
        <Typography variant="body2" color="text.secondary">
          {previewLoading}
        </Typography>
      </Box>
    );
  }

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

  // ─── Helpers for rendering entry icons ───────────────────────────────────
  const renderEntryIcon = (entry: FileEntry, size = iconSize) => {
    if (entry.is_dir) {
      return (
        <IconTile size={size} color="warning.main">
          <FolderIcon />
        </IconTile>
      );
    }

    if (entry.is_image) {
      return (
        <IconTile size={size} color="success.main">
          <ImageIcon />
        </IconTile>
      );
    }

    return (
      <IconTile size={size} color="info.main">
        <InsertDriveFileIcon />
      </IconTile>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, width: "100%" }}>
      {/* Breadcrumb bar */}
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.default",
        }}
      >
        <Box sx={{ px: 2, py: 1, maxWidth: 960, mx: "auto", overflow: "auto" }}>
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
            sx={{ fontFamily: (t) => t.tokens.fontMono, fontSize: "0.75rem", whiteSpace: "nowrap" }}
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
                  fontFamily: (t) => t.tokens.fontMono,
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
      </Box>

      {/* File list */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <Box
          sx={{
            maxWidth: 960,
            mx: "auto",
            width: "100%",
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
        {loading ? (
          <ListSkeleton
            viewMode={viewSettings.viewMode}
            iconSize={iconSize}
            itemHeight={itemHeight}
            gridCardSize={gridCardSize}
          />
        ) : sortedEntries.length === 0 ? (
          <EmptyState
            compact
            icon={<FolderOpenIcon />}
            title="This folder is empty"
            body="Upload a file or create a folder to get started."
          />
        ) : viewSettings.viewMode === "grid" ? (
          /* ─── Grid view ─────────────────────────────────────────── */
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${gridCardSize}px, 1fr))`,
              gap: 1,
              p: 1.5,
            }}
          >
            {path !== "/" && (
              <Card
                variant="outlined"
                sx={{
                  borderRadius: (t) => t.tokens.radius.md,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
                onClick={handleNavigateUp}
              >
                <CardContent
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.5,
                    p: 1.5,
                    "&:last-child": { pb: 1.5 },
                  }}
                >
                  <FolderOpenIcon sx={{ fontSize: Math.round(gridCardSize * 0.3), color: "warning.main" }} />
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ width: "100%", textAlign: "center" }}>
                    ..
                  </Typography>
                </CardContent>
              </Card>
            )}

            {sortedEntries.map((entry) => (
              <Card
                key={entry.path}
                variant="outlined"
                sx={{
                  borderRadius: (t) => t.tokens.radius.md,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
                onClick={() => {
                  if (longPressTriggered.current) return;
                  handleEntryClick(entry);
                }}
                onMouseDown={(e) => {
                  startLongPress(entry, e.currentTarget);
                }}
                onMouseUp={clearLongPress}
                onMouseLeave={clearLongPress}
                onTouchStart={(e) => {
                  startLongPress(entry, e.currentTarget);
                }}
                onTouchEnd={clearLongPress}
                onTouchCancel={clearLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ entry, anchorEl: e.currentTarget });
                }}
              >
                <CardContent
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.5,
                    p: 1.5,
                    "&:last-child": { pb: 1.5 },
                  }}
                >
                  {renderEntryIcon(entry, Math.round(gridCardSize * 0.35))}
                  <Typography
                    variant="caption"
                    fontWeight={entry.is_dir ? 600 : 400}
                    noWrap
                    sx={{ width: "100%", textAlign: "center" }}
                  >
                    {entry.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" fontSize="0.65rem" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {entry.is_dir
                      ? formatDirLabel(entry, folderSettings.showFoldersSize)
                      : formatSize(entry.size)}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          /* ─── List / Compact view ───────────────────────────────── */
          <List dense disablePadding>
            {path !== "/" && (
              <ListItem disablePadding>
                <ListItemButton onClick={handleNavigateUp} sx={{ minHeight: itemHeight }}>
                  <ListItemIcon sx={{ minWidth: iconSize + 12 }}>
                    <IconTile size={iconSize} color="warning.main">
                      <FolderOpenIcon />
                    </IconTile>
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

            {sortedEntries.map((entry) => (
              <ListItem key={entry.path} disablePadding>
                <ListItemButton
                  onClick={() => {
                    if (longPressTriggered.current) return;
                    handleEntryClick(entry);
                  }}
                  onMouseDown={(e) => {
                    startLongPress(entry, e.currentTarget);
                  }}
                  onMouseUp={clearLongPress}
                  onMouseLeave={clearLongPress}
                  onTouchStart={(e) => {
                    startLongPress(entry, e.currentTarget);
                  }}
                  onTouchEnd={clearLongPress}
                  onTouchCancel={clearLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ entry, anchorEl: e.currentTarget });
                  }}
                  sx={{
                    minHeight: itemHeight,
                    ...(viewSettings.viewMode === "compact" && { py: 0.25 }),
                  }}
                >
                  <ListItemIcon sx={{ minWidth: iconSize + 12 }}>
                    {renderEntryIcon(entry)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography
                        variant={viewSettings.viewMode === "compact" ? "caption" : "body2"}
                        fontWeight={entry.is_dir ? 600 : 400}
                        noWrap
                      >
                        {entry.name}
                      </Typography>
                    }
                    secondary={
                      viewSettings.viewMode === "compact" ? undefined : (
                        <Stack direction="row" spacing={2} component="span">
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontFamily: (t) => t.tokens.fontMono, fontVariantNumeric: "tabular-nums" }}
                          >
                            {entry.is_dir
                              ? formatDirLabel(entry, folderSettings.showFoldersSize)
                              : formatSize(entry.size)}
                          </Typography>
                          {entry.modified && (
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {new Date(entry.modified).toLocaleDateString()}
                            </Typography>
                          )}
                        </Stack>
                      )
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
        </Box>
      </Box>

      {/* Context menu */}
      <Menu
        open={!!contextMenu}
        anchorEl={contextMenu?.anchorEl}
        onClose={() => setContextMenu(null)}
        anchorOrigin={{ vertical: "center", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{
          paper: { sx: { minWidth: 210, py: 0.5 } },
        }}
      >
        {contextMenu && (
          <>
            <Box sx={{ px: 2, pt: 1, pb: 0.75 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: "block", fontFamily: (t) => t.tokens.fontMono }}
              >
                {contextMenu.entry.name}
              </Typography>
            </Box>
            <Divider sx={{ mb: 0.5 }} />
          </>
        )}
        <MenuItem onClick={handleOpenFromMenu}>
          <PlayArrowIcon fontSize="small" sx={{ mr: 1.5, color: "primary.main" }} />
          Open
        </MenuItem>

        <MenuItem onClick={handleDownloadFromMenu} disabled={downloading}>
          <DownloadIcon fontSize="small" sx={{ mr: 1.5, color: "success.main" }} />
          {downloading ? "Downloading…" : "Download"}
        </MenuItem>
        <MenuItem onClick={handleDeleteFromMenu} sx={{ color: "error.main" }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1.5 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Loading Backdrop */}
      <Backdrop
        open={isUploading || downloading}
        sx={{
          zIndex: (t) => t.tokens.z.overlay,
          bgcolor: (t) => t.tokens.scrim,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            px: 3,
            py: 2.25,
            borderRadius: (t) => t.tokens.radius.md,
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            boxShadow: (t) => t.tokens.shadow.strong,
          }}
        >
          <CircularProgress size={22} />
          <Typography variant="body1" fontWeight={600}>
            {isUploading ? "Uploading file…" : "Downloading…"}
          </Typography>
        </Box>
      </Backdrop>

      {/* Error Dialog */}
      <Dialog
        open={!!error}
        onClose={() => setError(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "error.main", fontWeight: 650 }}>Action failed</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "50vh",
              overflowY: "auto",
              p: 1.5,
              bgcolor: "action.hover",
              borderRadius: (t) => t.tokens.radius.xs,
              fontFamily: (t) => t.tokens.fontMono,
              fontSize: "0.75rem",
            }}
          >
            {error}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setError(null)} variant="contained" color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 650 }}>
          Delete {deleteTarget?.is_dir ? "folder" : "file"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete{" "}
            <Box component="span" sx={{ fontWeight: 600, color: "text.primary", fontFamily: (t) => t.tokens.fontMono }}>
              {deleteTarget?.name}
            </Box>
            ?{deleteTarget?.is_dir
              ? " All contents inside will be permanently removed."
              : " This action cannot be undone."}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0, gap: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            color="error"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* FAB Backdrop */}
      {fabOpen && (
        <Box
          onClick={() => setFabOpen(false)}
          aria-hidden="true"
          sx={{
            position: "fixed",
            inset: 0,
            bgcolor: (t) => t.tokens.scrim,
            zIndex: (t) => t.tokens.z.fabBackdrop,
          }}
        />
      )}

      {/* FAB Options Area */}
      <Box
        sx={{
          position: "fixed",
          right: 20,
          bottom: (t) => `calc(env(safe-area-inset-bottom, 0px) + ${t.tokens.fabOffset}px)`,
          zIndex: (t) => t.tokens.z.fab,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 1.5,
            opacity: fabOpen ? 1 : 0,
            pointerEvents: fabOpen ? "auto" : "none",
            transform: fabOpen ? "translateY(0)" : "translateY(16px)",
            transition: (t) =>
              t.transitions.create(["opacity", "transform"], { duration: 200 }),
          }}
        >
          <Card
            sx={{
              borderRadius: (t) => t.tokens.radius.md,
              bgcolor: "background.paper",
              overflow: "hidden",
              boxShadow: (t) => t.tokens.shadow.medium,
            }}
          >
            <ListItemButton onClick={handleCreateFolderStart} sx={{ py: 1.25, px: 2 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <CreateNewFolderIcon color="action" />
              </ListItemIcon>
              <ListItemText primary="Folder" primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          </Card>

          <Card
            sx={{
              borderRadius: (t) => t.tokens.radius.md,
              bgcolor: "background.paper",
              overflow: "hidden",
              boxShadow: (t) => t.tokens.shadow.medium,
            }}
          >
            <ListItemButton onClick={handleUploadFile} sx={{ py: 1.25, px: 2 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <FileUploadIcon color="action" />
              </ListItemIcon>
              <ListItemText primary="Upload" primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          </Card>
        </Box>

        <Fab
          color="primary"
          aria-label={fabOpen ? "Close create menu" : "Create"}
          aria-expanded={fabOpen}
          onClick={handleFabToggle}
          sx={{
            width: 60,
            height: 60,
            borderRadius: "20px",
            transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
            transition: (t) =>
              `${t.transitions.create("transform", { duration: 250 })}, ${t.transitions.create(
                "background-color",
                { duration: 200 },
              )}`,
            "&:active": {
              transform: fabOpen ? "rotate(45deg) scale(0.95)" : "rotate(0deg) scale(0.95)",
            },
          }}
        >
          <AddIcon sx={{ fontSize: 30 }} />
        </Fab>
      </Box>

      {/* Create Folder Dialog */}
      <Dialog
        open={createFolderDialogOpen}
        onClose={() => {
          if (!isCreatingFolder) setCreateFolderDialogOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <Box component="form" onSubmit={handleCreateFolderSubmit}>
          <DialogTitle sx={{ fontWeight: 650 }}>New folder</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Folder name"
              placeholder="e.g. backups"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 0, gap: 1 }}>
            <Button
              onClick={() => setCreateFolderDialogOpen(false)}
              disabled={isCreatingFolder}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={!newFolderName.trim() || isCreatingFolder}
              startIcon={
                isCreatingFolder ? <CircularProgress size={16} color="inherit" /> : undefined
              }
            >
              Create
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

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
