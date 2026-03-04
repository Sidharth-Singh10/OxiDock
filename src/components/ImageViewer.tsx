import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  Box,
  CircularProgress,
  IconButton,
  Typography,
  Snackbar,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import RefreshIcon from "@mui/icons-material/Refresh";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import CropFreeIcon from "@mui/icons-material/CropFree";

import type { FileEntry } from "../lib/types";
import { getCached, isCached, setCached, getThumbnailCached } from "../lib/imageCache";

interface Props {
  sessionId: string;
  images: FileEntry[];
  initialIndex: number;
  onClose: () => void;
}

type LoadState = "loading" | "done" | "error";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const ZOOM_STEP = 0.5;

/** Derive a data-uri MIME type from a filename extension. */
function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "jpeg";
  if (ext === "svg") return "image/svg+xml";
  return `image/${ext === "jpg" ? "jpeg" : ext}`;
}

/** Format byte size to a human-readable string. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageViewer({ sessionId, images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [src, setSrc] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Progressive loading — blurred thumbnail placeholder
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);

  // Retry state
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Image intrinsic dimensions (populated via onLoad)
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(null);

  // Info panel toggle
  const [showInfo, setShowInfo] = useState(false);

  // Zoom & pan state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Touch gesture tracking
  const touchStartRef = useRef<{ x: number; y: number; dist: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const panStartRef = useRef<{ tx: number; ty: number; x: number; y: number } | null>(null);

  const entry = images[index];

  // ─── Blob URL management ──────────────────────────────────────────────────
  const blobUrlRef = useRef<string | null>(null);

  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  /** Read a local cached file and return a blob URL the WebView can display. */
  const localPathToBlobUrl = useCallback(async (localPath: string, name: string): Promise<string> => {
    const bytes = await readFile(localPath);
    const blob = new Blob([bytes], { type: mimeFromName(name) });
    return URL.createObjectURL(blob);
  }, []);

  // ─── Load image ────────────────────────────────────────────────────────────
  const loadImage = useCallback(
    async (i: number, retry = 0) => {
      const img = images[i];
      if (!img) return;

      // Reset state on first attempt
      if (retry === 0) {
        setLoadState("loading");
        revokeBlobUrl();
        setSrc(null);
        setScale(1);
        setTranslate({ x: 0, y: 0 });
        setNaturalDims(null);
        setRetryCount(0);
        setAutoRetrying(false);

        // Progressive: immediately show blurred thumbnail if cached
        const thumbB64 = getThumbnailCached(img.path);
        if (thumbB64) {
          setThumbnailSrc(`data:${mimeFromName(img.name)};base64,${thumbB64}`);
        } else {
          setThumbnailSrc(null);
        }
      }

      try {
        let localPath: string;
        if (isCached(img.path)) {
          localPath = getCached(img.path)!;
        } else {
          const remoteMtime = img.modified
            ? Math.floor(new Date(img.modified).getTime() / 1000)
            : undefined;

          localPath = await invoke<string>("sftp_cache_image", {
            sessionId,
            path: img.path,
            remoteMtime,
          });
          setCached(img.path, localPath);
        }

        const blobUrl = await localPathToBlobUrl(localPath, img.name);
        revokeBlobUrl();
        blobUrlRef.current = blobUrl;
        setSrc(blobUrl);
        setLoadState("done");
        setAutoRetrying(false);

        // Preload neighbours in background (best-effort)
        const preload = (idx: number) => {
          const neighbour = images[idx];
          if (neighbour && !isCached(neighbour.path)) {
            const mtime = neighbour.modified
              ? Math.floor(new Date(neighbour.modified).getTime() / 1000)
              : undefined;
            invoke<string>("sftp_cache_image", {
              sessionId,
              path: neighbour.path,
              remoteMtime: mtime,
            })
              .then((p) => setCached(neighbour.path, p))
              .catch(() => {/* silent */});
          }
        };
        preload(i - 1);
        preload(i + 1);
      } catch (e) {
        console.error("ImageViewer load error:", e);
        if (retry < MAX_RETRIES) {
          const nextRetry = retry + 1;
          setRetryCount(nextRetry);
          setAutoRetrying(true);
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retry);
          retryTimerRef.current = setTimeout(() => loadImage(i, nextRetry), delay);
        } else {
          setLoadState("error");
          setAutoRetrying(false);
        }
      }
    },
    [images, sessionId, revokeBlobUrl, localPathToBlobUrl],
  );

  useEffect(() => {
    loadImage(index);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      revokeBlobUrl();
    };
  }, [index, loadImage, revokeBlobUrl]);

  // ─── Navigation ───────────────────────────────────────────────────────────
  const goTo = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= images.length) return;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setIndex(newIndex);
  };

  // ─── Zoom helpers ─────────────────────────────────────────────────────────
  const zoomIn = () => setScale((s) => Math.min(s + ZOOM_STEP, MAX_SCALE));
  const zoomOut = () => {
    setScale((s) => {
      const next = Math.max(s - ZOOM_STEP, MIN_SCALE);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  };
  const zoomReset = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  // ─── Open with external app ───────────────────────────────────────────────
  const handleOpenExternal = async () => {
    try {
      let localPath: string;
      if (isCached(entry.path)) {
        localPath = getCached(entry.path)!;
      } else {
        const mtime = entry.modified
          ? Math.floor(new Date(entry.modified).getTime() / 1000)
          : undefined;
        localPath = await invoke<string>("sftp_cache_image", {
          sessionId,
          path: entry.path,
          remoteMtime: mtime,
        });
        setCached(entry.path, localPath);
      }
      await invoke("open_file_externally", { path: localPath });
    } catch (e) {
      setSnackbar(`Failed to open externally: ${e}`);
    }
  };

  // ─── Touch gestures (pinch-zoom, pan, swipe) ──────────────────────────────
  const getTouchDist = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return 0;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchStartRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        dist: getTouchDist(e),
      };
      panStartRef.current = null;
    } else if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        dist: 0,
      };
      panStartRef.current = {
        tx: translate.x,
        ty: translate.y,
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && touchStartRef.current) {
      const newDist = getTouchDist(e);
      const ratio = newDist / (touchStartRef.current.dist || 1);
      setScale((prev) => Math.min(Math.max(prev * ratio, MIN_SCALE), MAX_SCALE));
      touchStartRef.current = { ...touchStartRef.current, dist: newDist };
    } else if (e.touches.length === 1 && panStartRef.current && scale > 1) {
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      setTranslate({ x: panStartRef.current.tx + dx, y: panStartRef.current.ty + dy });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const now = Date.now();
    // Double-tap to reset zoom
    if (now - lastTapRef.current < 300 && e.changedTouches.length === 1) {
      zoomReset();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    // Swipe navigation when not zoomed in
    if (touchStartRef.current && scale <= 1 && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      if (Math.abs(dx) > 60) {
        goTo(dx < 0 ? index + 1 : index - 1);
      }
    }
    touchStartRef.current = null;
    panStartRef.current = null;
  };

  // ─── Keyboard arrows ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onClose]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const zoomPercent = `${Math.round(scale * 100)}%`;

  // File extension for the info panel
  const fileExt = entry?.name.split(".").pop()?.toUpperCase() ?? "—";

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        bgcolor: "rgba(0,0,0,0.96)",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
    >
      {/* Top bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          pt: "env(safe-area-inset-top, 0px)",
          gap: 1,
          height: 56,
          bgcolor: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px)",
          flexShrink: 0,
        }}
      >
        <IconButton onClick={onClose} sx={{ color: "rgba(255,255,255,0.9)" }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, overflow: "hidden" }}>
          <Typography
            variant="subtitle2"
            noWrap
            sx={{ color: "rgba(255,255,255,0.95)", fontWeight: 600 }}
          >
            {entry?.name}
          </Typography>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)" }}>
            {index + 1} / {images.length}
          </Typography>
        </Box>
        <IconButton
          onClick={() => setShowInfo((v) => !v)}
          sx={{ color: showInfo ? "primary.main" : "rgba(255,255,255,0.7)" }}
        >
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton onClick={handleOpenExternal} sx={{ color: "rgba(255,255,255,0.7)" }}>
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Image area */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progressive: blurred thumbnail placeholder */}
        {(loadState === "loading" || autoRetrying) && thumbnailSrc && (
          <Box
            component="img"
            src={thumbnailSrc}
            alt=""
            sx={{
              position: "absolute",
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              filter: "blur(16px)",
              transform: "scale(1.05)",
              opacity: 0.7,
            }}
          />
        )}

        {/* Loading / retrying spinner */}
        {(loadState === "loading" || autoRetrying) && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              zIndex: 1,
            }}
          >
            <CircularProgress size={44} sx={{ color: "rgba(255,255,255,0.6)" }} />
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.4)" }}>
              {autoRetrying
                ? `Retrying ${retryCount}/${MAX_RETRIES}…`
                : "Loading image…"}
            </Typography>
          </Box>
        )}

        {loadState === "error" && !autoRetrying && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              p: 4,
            }}
          >
            <BrokenImageIcon sx={{ fontSize: 64, color: "rgba(255,255,255,0.2)" }} />
            <Typography sx={{ color: "rgba(255,255,255,0.6)" }}>
              Failed to load image
            </Typography>
            <Box
              component="button"
              onClick={() => loadImage(index)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 3,
                py: 1.5,
                borderRadius: 2,
                bgcolor: "rgba(255,255,255,0.12)",
                color: "white",
                border: "none",
                cursor: "pointer",
                "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
              }}
            >
              <RefreshIcon fontSize="small" />
              Retry
            </Box>
          </Box>
        )}

        {loadState === "done" && src && (
          <Box
            component="img"
            src={src}
            alt={entry?.name}
            draggable={false}
            onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const el = e.currentTarget;
              setNaturalDims({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            onError={() => {
              console.error("ImageViewer <img> failed to load src");
              setLoadState("error");
            }}
            sx={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
              transformOrigin: "center center",
              transition: scale === 1 ? "transform 0.2s ease" : "none",
              willChange: "transform",
            }}
          />
        )}

        {/* Info panel — slides in from the right */}
        {showInfo && loadState === "done" && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: 220,
              bgcolor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(12px)",
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              animation: "slideInRight 0.25s ease-out",
              "@keyframes slideInRight": {
                from: { transform: "translateX(100%)" },
                to: { transform: "translateX(0)" },
              },
            }}
          >
            <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.4)", letterSpacing: 1.5 }}>
              Image Info
            </Typography>

            <Box>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.45)" }}>
                Dimensions
              </Typography>
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)" }}>
                {naturalDims ? `${naturalDims.w} × ${naturalDims.h}` : "—"}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.45)" }}>
                Format
              </Typography>
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)" }}>
                {fileExt}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.45)" }}>
                File Size
              </Typography>
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)" }}>
                {entry?.size ? formatSize(entry.size) : "—"}
              </Typography>
            </Box>

            {entry?.modified && (
              <Box>
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.45)" }}>
                  Modified
                </Typography>
                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)" }}>
                  {new Date(entry.modified).toLocaleDateString()}
                </Typography>
              </Box>
            )}

            <Box>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.45)" }}>
                Zoom
              </Typography>
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.9)" }}>
                {zoomPercent}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Prev / Next chevrons (visible on non-touch or tablet) */}
        {index > 0 && loadState === "done" && (
          <IconButton
            onClick={() => goTo(index - 1)}
            sx={{
              position: "absolute",
              left: 8,
              color: "rgba(255,255,255,0.7)",
              bgcolor: "rgba(0,0,0,0.3)",
              "&:hover": { bgcolor: "rgba(0,0,0,0.5)" },
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
        )}
        {index < images.length - 1 && loadState === "done" && (
          <IconButton
            onClick={() => goTo(index + 1)}
            sx={{
              position: "absolute",
              right: showInfo ? 228 : 8,
              color: "rgba(255,255,255,0.7)",
              bgcolor: "rgba(0,0,0,0.3)",
              "&:hover": { bgcolor: "rgba(0,0,0,0.5)" },
              transition: "right 0.25s ease",
            }}
          >
            <ChevronRightIcon />
          </IconButton>
        )}
      </Box>

      {/* Bottom bar: zoom controls + dot indicator */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pb: "max(8px, env(safe-area-inset-bottom, 8px))",
          pt: 1,
          flexShrink: 0,
          gap: 0.5,
        }}
      >
        {/* Zoom controls */}
        {loadState === "done" && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 0.5,
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            <IconButton
              size="small"
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              sx={{ color: "rgba(255,255,255,0.7)", "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" } }}
            >
              <ZoomOutIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="caption"
              sx={{
                color: "rgba(255,255,255,0.7)",
                minWidth: 40,
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {zoomPercent}
            </Typography>
            <IconButton
              size="small"
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              sx={{ color: "rgba(255,255,255,0.7)", "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" } }}
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
            {scale !== 1 && (
              <IconButton
                size="small"
                onClick={zoomReset}
                sx={{ color: "rgba(255,255,255,0.6)" }}
              >
                <CropFreeIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        )}

        {/* Dot indicator */}
        {images.length > 1 && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              gap: 0.75,
              pt: 0.5,
            }}
          >
            {images.map((_, i) => (
              <Box
                key={i}
                onClick={() => goTo(i)}
                sx={{
                  width: i === index ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  bgcolor: i === index ? "primary.main" : "rgba(255,255,255,0.25)",
                  transition: "all 0.25s ease",
                  cursor: "pointer",
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
    </Box>
  );
}
