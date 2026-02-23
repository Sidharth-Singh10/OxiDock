import { useState, useEffect, useCallback, forwardRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  Fab,
  Grow,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import type { KeyInfo } from "../lib/types";
import { checkBiometricAvailable, requireBiometric } from "../lib/useBiometric";

/* ── Center scale + fade transition ─────────────────────────────── */
const GrowTransition = forwardRef(function GrowTransition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return (
    <Grow
      ref={ref}
      {...props}
      timeout={{ enter: 350, exit: 250 }}
      easing={{
        enter: "cubic-bezier(0.22, 1, 0.36, 1)",
        exit: "cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      style={{ transformOrigin: "center center" }}
    />
  );
});

export default function KeyManager() {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [name, setName] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  const [viewingKey, setViewingKey] = useState<KeyInfo | null>(null);
  const [viewingKeyPem, setViewingKeyPem] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const result = await invoke<KeyInfo[]>("list_keys");
      setKeys(result);
    } catch (e) {
      console.error("Failed to load keys:", e);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleOpenForm = async () => {
    try {
      // First key? Check biometric hardware is available
      if (keys.length === 0) {
        const { available, error: bioErr } = await checkBiometricAvailable();
        if (!available) {
          setSnackMsg(
            `Biometric authentication is required but not available: ${
              bioErr ?? "unknown reason"
            }. Please enable biometrics in your device settings.`
          );
          return;
        }
      }
      // Always require biometric auth before opening the form
      await requireBiometric("Authenticate to add SSH key");
    } catch {
      // User cancelled or auth failed — silently abort
      return;
    }
    setName("");
    setKeyPem("");
    setError(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    if (!loading) setShowForm(false);
  };

  const handleStoreKey = async () => {
    if (!name.trim() || !keyPem.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await invoke("store_key", { name: name.trim(), keyPem: keyPem.trim() });
      setShowForm(false);
      await loadKeys();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (keyName: string) => {
    try {
      await requireBiometric("Authenticate to delete SSH key");
    } catch {
      return;
    }
    try {
      await invoke("delete_key", { name: keyName });
      await loadKeys();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleViewKey = async (key: KeyInfo) => {
    try {
      await requireBiometric("Authenticate to view key details");
    } catch {
      return;
    }
    try {
      const pem = await invoke<string>("get_key", { name: key.name });
      setViewingKeyPem(pem);
      setViewingKey(key);
    } catch (e) {
      setSnackMsg(String(e));
    }
  };

  const isFormValid = name.trim().length > 0 && keyPem.trim().length > 0;

  return (
    <Box sx={{ position: "relative", minHeight: "100%" }}>
      {/* Key list */}
      {keys.length === 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 8,
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "action.hover",
            }}
          >
            <VpnKeyIcon sx={{ fontSize: 36, color: "text.secondary", opacity: 0.6 }} />
          </Box>
          <Typography variant="subtitle1" fontWeight={600}>
            No SSH keys yet
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 240 }}>
            Add a key to connect to your servers securely
          </Typography>
        </Box>
      ) : (
        <List disablePadding sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {keys.map((key) => (
            <ListItem
              key={key.name}
              disablePadding
              secondaryAction={
                <IconButton
                  color="error"
                  size="small"
                  onClick={() => handleDeleteKey(key.name)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemButton sx={{ minHeight: 56 }} onClick={() => handleViewKey(key)}>
                <ListItemIcon sx={{ minWidth: 52 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: (theme) => `${theme.palette.success.main}1a`,
                    }}
                  >
                    <VpnKeyIcon sx={{ fontSize: 22, color: "success.main" }} />
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={key.name}
                  secondary={
                    <>
                      <Typography
                        component="span"
                        variant="caption"
                        fontFamily="monospace"
                        color="text.secondary"
                        display="block"
                      >
                        {key.fingerprint}
                      </Typography>
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                      >
                        Added {new Date(key.created_at).toLocaleDateString()}
                      </Typography>
                    </>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

      {/* FAB to add key */}
      <Fab
        color="primary"
        size="medium"
        onClick={handleOpenForm}
        sx={{
          position: "fixed",
          bottom: 80,
          right: 20,
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          "&:active": { transform: "scale(0.92)" },
        }}
      >
        <AddIcon />
      </Fab>

      {/* ── Centered popup Dialog ──────────────────────────────────── */}
      <Dialog
        open={showForm}
        onClose={handleCloseForm}
        TransitionComponent={GrowTransition}
        keepMounted={false}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            m: 2,
            borderRadius: "20px",
            bgcolor: "background.paper",
            backgroundImage: "none",
            maxHeight: "85dvh",
            overflow: "auto",
          },
        }}
        sx={{
          "& .MuiDialog-container": {
            alignItems: "center",
            justifyContent: "center",
          },
          "& .MuiBackdrop-root": {
            backgroundColor: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
            transition: "opacity 0.35s ease !important",
          },
        }}
      >
        {/* Top pill accent */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            pt: 1.5,
            pb: 0.5,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 2,
              bgcolor: "text.secondary",
              opacity: 0.25,
            }}
          />
        </Box>

        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2.5,
            pb: 1,
          }}
        >
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.1rem" }}>
            Add New Key
          </Typography>
          <IconButton
            size="small"
            onClick={handleCloseForm}
            sx={{
              color: "text.secondary",
              bgcolor: "action.hover",
              "&:hover": { bgcolor: "action.selected" },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Form body */}
        <Stack spacing={2} sx={{ px: 2.5, pb: 3, pt: 0.5 }}>
          <TextField
            id="key-name-input"
            label="Key Name"
            placeholder="e.g. my-vps-key"
            required
            fullWidth
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="medium"
          />
          <TextField
            id="key-pem-input"
            label="Private Key (PEM)"
            placeholder="Paste your SSH private key here..."
            required
            fullWidth
            multiline
            minRows={4}
            maxRows={8}
            value={keyPem}
            onChange={(e) => setKeyPem(e.target.value)}
            sx={{
              "& textarea": {
                fontFamily: "monospace",
                fontSize: "0.8rem",
                lineHeight: 1.5,
              },
            }}
          />

          {error && (
            <Typography variant="body2" color="error" sx={{ px: 0.5 }}>
              {error}
            </Typography>
          )}

          {/* Action buttons */}
          <Stack direction="row" spacing={1.5} sx={{ pt: 0.5 }}>
            <Box
              onClick={handleStoreKey}
              component="button"
              sx={{
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                px: 2,
                py: 1.4,
                border: "none",
                borderRadius: "14px",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
                opacity: !isFormValid || loading ? 0.5 : 1,
                pointerEvents: !isFormValid || loading ? "none" : "auto",
                transition: "opacity 0.2s, transform 0.15s, background-color 0.2s",
                "&:hover": { bgcolor: "primary.light" },
                "&:active": { transform: "scale(0.97)" },
              }}
            >
              {loading && <CircularProgress size={18} color="inherit" />}
              {loading ? "Saving…" : "Save Key"}
            </Box>
            <Box
              onClick={handleCloseForm}
              component="button"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                px: 2.5,
                py: 1.4,
                border: 1,
                borderColor: "divider",
                borderRadius: "14px",
                bgcolor: "transparent",
                color: "text.primary",
                fontWeight: 500,
                fontSize: "0.9rem",
                cursor: "pointer",
                transition: "background-color 0.2s, transform 0.15s",
                "&:hover": { bgcolor: "action.hover" },
                "&:active": { transform: "scale(0.97)" },
              }}
            >
              Cancel
            </Box>
          </Stack>
        </Stack>
      </Dialog>

      {/* ── Key detail dialog (after biometric auth) ────────────── */}
      <Dialog
        open={!!viewingKey}
        onClose={() => {
          setViewingKey(null);
          setViewingKeyPem(null);
        }}
        TransitionComponent={GrowTransition}
        keepMounted={false}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            m: 2,
            borderRadius: "20px",
            bgcolor: "background.paper",
            backgroundImage: "none",
            maxHeight: "80dvh",
          },
        }}
        sx={{
          "& .MuiDialog-container": {
            alignItems: "center",
            justifyContent: "center",
          },
          "& .MuiBackdrop-root": {
            backgroundColor: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
            transition: "opacity 0.35s ease !important",
          },
        }}
      >
        {/* Top pill accent */}
        <Box sx={{ display: "flex", justifyContent: "center", pt: 1.5, pb: 0.5 }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 2,
              bgcolor: "text.secondary",
              opacity: 0.25,
            }}
          />
        </Box>

        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2.5,
            pb: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <FingerprintIcon sx={{ color: "success.main", fontSize: 22 }} />
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.1rem" }}>
              Key Details
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => setViewingKey(null)}
            sx={{
              color: "text.secondary",
              bgcolor: "action.hover",
              "&:hover": { bgcolor: "action.selected" },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Body */}
        {viewingKey && (
          <Stack spacing={2} sx={{ px: 2.5, pb: 3, pt: 0.5 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Name
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {viewingKey.name}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Fingerprint
              </Typography>
              <Typography
                variant="body2"
                fontFamily="monospace"
                sx={{ wordBreak: "break-all" }}
              >
                {viewingKey.fingerprint}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Created
              </Typography>
              <Typography variant="body2">
                {new Date(viewingKey.created_at).toLocaleString()}
              </Typography>
            </Box>
            {viewingKeyPem && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Secret Key (PEM)
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    mt: 0.5,
                    bgcolor: "action.hover",
                    borderRadius: 2,
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  <Typography
                    variant="body2"
                    fontFamily="monospace"
                    sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
                  >
                    {viewingKeyPem}
                  </Typography>
                </Box>
              </Box>
            )}
          </Stack>
        )}
      </Dialog>

      {/* ── Snackbar for biometric errors ───────────────────────── */}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={5000}
        onClose={() => setSnackMsg(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackMsg(null)}
          severity="warning"
          variant="filled"
          sx={{ width: "100%", borderRadius: "14px" }}
        >
          {snackMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
