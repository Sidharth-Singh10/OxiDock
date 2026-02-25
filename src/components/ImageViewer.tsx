import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
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

import type { FileEntry } from "../lib/types";
import { getCached, isCached, setCached } from "../lib/imageCache";

interface Props {
  sessionId: string;
  images: FileEntry[];
  initialIndex: number;
  onClose: () => void;
}

type LoadState = "loading" | "done" | "error";

export default function ImageViewer({ sessionId, images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [src, setSrc] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Zoom & pan state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Touch gesture tracking
  const touchStartRef = useRef<{ x: number; y: number; dist: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const panStartRef = useRef<{ tx: number; ty: number; x: number; y: number } | null>(null);

  const entry = images[index];

  // ─── Load image ────────────────────────────────────────────────────────────
  const loadImage = useCallback(
    async (i: number) => {
      const img = images[i];
      if (!img) return;
      setLoadState("loading");
      setSrc(null);
      setScale(1);
      setTranslate({ x: 0, y: 0 });

      try {
        let localPath: string;
        if (isCached(img.path)) {
          localPath = getCached(img.path)!;
        } else {
          // Parse mtime from the ISO string stored in entry.modified
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
        setSrc(convertFileSrc(localPath));
        setLoadState("done");

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
        setLoadState("error");
      }
    },
    [images, sessionId],
  );

  useEffect(() => {
    loadImage(index);
  }, [index, loadImage]);

  // ─── Navigation ───────────────────────────────────────────────────────────
  const goTo = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= images.length) return;
    setIndex(newIndex);
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
      setScale((prev) => Math.min(Math.max(prev * ratio, 1), 6));
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
      setScale(1);
      setTranslate({ x: 0, y: 0 });
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
        {loadState === "loading" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <CircularProgress size={44} sx={{ color: "rgba(255,255,255,0.6)" }} />
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.4)" }}>
              Loading image…
            </Typography>
          </Box>
        )}

        {loadState === "error" && (
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
              right: 8,
              color: "rgba(255,255,255,0.7)",
              bgcolor: "rgba(0,0,0,0.3)",
              "&:hover": { bgcolor: "rgba(0,0,0,0.5)" },
            }}
          >
            <ChevronRightIcon />
          </IconButton>
        )}
      </Box>

      {/* Bottom dot indicator */}
      {images.length > 1 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: 0.75,
            pb: "max(12px, env(safe-area-inset-bottom, 12px))",
            pt: 1.5,
            flexShrink: 0,
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

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
    </Box>
  );
}
