import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppBar,
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import ImageIcon from "@mui/icons-material/Image";
import CodeIcon from "@mui/icons-material/Code";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import type { FilePreview as FilePreviewType } from "../lib/types";

interface Props {
  data: FilePreviewType;
  filename: string;
  sessionId: string;
  filePath: string;
  onBack: () => void;
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const imageExts = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"];
  const codeExts = [
    "js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h",
    "css", "html", "json", "toml", "yaml", "yml", "md", "sh", "bash",
  ];
  if (imageExts.includes(ext)) return <ImageIcon sx={{ fontSize: 20, color: "success.main" }} />;
  if (codeExts.includes(ext)) return <CodeIcon sx={{ fontSize: 20, color: "info.main" }} />;
  if (ext === "pdf") return <PictureAsPdfIcon sx={{ fontSize: 20, color: "error.main" }} />;
  return <InsertDriveFileIcon sx={{ fontSize: 20, color: "text.secondary" }} />;
}

export default function FilePreview({
  data,
  filename,
  sessionId,
  filePath,
  onBack,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const savedPath = await invoke<string>("sftp_save_file", {
        sessionId,
        remotePath: filePath,
        fileName: filename,
      });
      setSnackbar(`Saved to ${savedPath}`);
    } catch (e) {
      setSnackbar(`Download failed: ${e}`);
    } finally {
      setDownloading(false);
    }
  };

  const isImage =
    !data.is_text &&
    /\.(png|jpg|jpeg|gif|bmp|webp|svg)$/i.test(filename);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Preview header bar */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ minHeight: 48, gap: 1 }}>
          <IconButton
            edge="start"
            onClick={onBack}
            sx={{ color: "text.primary" }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "action.hover",
              flexShrink: 0,
            }}
          >
            {getFileIcon(filename)}
          </Box>
          <Box sx={{ flex: 1, overflow: "hidden" }}>
            <Typography variant="subtitle2" noWrap>
              {filename}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {(data.total_size / 1024).toFixed(1)} KB
              {data.truncated && " · truncated"}
            </Typography>
          </Box>
          <Tooltip title="Download file">
            <span>
              <IconButton
                onClick={handleDownload}
                disabled={downloading}
                sx={{ color: "text.primary" }}
              >
                {downloading ? <CircularProgress size={20} /> : <DownloadIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {isImage ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <img
              src={`data:image/${filename.split(".").pop()};base64,${data.content}`}
              alt={filename}
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                borderRadius: "8px",
              }}
            />
          </Box>
        ) : data.is_text ? (
          <Paper
            elevation={0}
            sx={{
              m: 1.5,
              p: 2,
              fontFamily: "monospace",
              fontSize: "0.8rem",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "calc(100dvh - 120px)",
              overflow: "auto",
              bgcolor: "background.default",
              border: 1,
              borderColor: "divider",
            }}
          >
            {data.content}
          </Paper>
        ) : (
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
              <InsertDriveFileIcon sx={{ fontSize: 32, color: "text.secondary", opacity: 0.5 }} />
            </Box>
            <Typography variant="body1" color="text.secondary">
              Binary file — preview not available
            </Typography>
            <Typography variant="caption" color="text.secondary">
              File size: {(data.total_size / 1024).toFixed(1)} KB
            </Typography>
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
