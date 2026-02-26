import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Box, CircularProgress } from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import type { FileEntry } from "../lib/types";
import {
  getThumbnailCached,
  setThumbnailCached,
  isThumbnailCached,
} from "../lib/imageCache";

interface Props {
  sessionId: string;
  entry: FileEntry;
  onClick: () => void;
  onLongPress: (target: HTMLElement) => void;
}

export default function ImageThumbnail({ sessionId, entry, onClick, onLongPress }: Props) {
  // Initialise from cache instantly — no loading state needed if we have it.
  const cached = getThumbnailCached(entry.path);
  const [b64, setB64] = useState<string | null>(cached);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    cached ? "done" : "idle",
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Derive MIME type from extension
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "jpeg";
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;

  useEffect(() => {
    // Already served from cache — no observer needed.
    if (status === "done") return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        // Guard: another effect run may have already started loading.
        if (status !== "idle") return;

        // Double-check the cache — a sibling tile may have populated it.
        if (isThumbnailCached(entry.path)) {
          setB64(getThumbnailCached(entry.path));
          setStatus("done");
          return;
        }

        setStatus("loading");
        invoke<string>("sftp_get_thumbnail", {
          sessionId,
          path: entry.path,
        })
          .then((data) => {
            setThumbnailCached(entry.path, data);
            setB64(data);
            setStatus("done");
          })
          .catch(() => setStatus("error"));
      },
      { rootMargin: "60px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [entry.path, sessionId, status]);

  // ─── Long-press helpers ───────────────────────────────────────────────────
  const clearLong = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const startLong = (target: HTMLElement) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress(target);
    }, 500);
  };

  const handleClick = () => {
    if (longPressTriggered.current) return;
    onClick();
  };

  return (
    <Box
      ref={containerRef}
      onClick={handleClick}
      onMouseDown={(e) => startLong(e.currentTarget)}
      onMouseUp={clearLong}
      onMouseLeave={clearLong}
      onTouchStart={(e) => startLong(e.currentTarget)}
      onTouchEnd={clearLong}
      onTouchCancel={clearLong}
      sx={{
        width: 40,
        height: 40,
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: (theme) => `${theme.palette.success.main}18`,
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      {status === "done" && b64 ? (
        <Box
          component="img"
          src={`data:${mime};base64,${b64}`}
          alt={entry.name}
          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : status === "error" || status === "idle" ? (
        <ImageIcon sx={{ fontSize: 22, color: "success.main", opacity: 0.6 }} />
      ) : status === "loading" ? (
        <CircularProgress size={16} thickness={4} />
      ) : null}
    </Box>
  );
}
