import { useState, useEffect, useCallback, forwardRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Alert,
  Box,
  Button,
  Chip,
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
import type { KeyType } from "../lib/types";
import type { TransitionProps } from "@mui/material/transitions";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import type { KeyInfo } from "../lib/types";
import { checkBiometricAvailable, requireBiometric } from "../lib/useBiometric";
import EmptyState from "./EmptyState";

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

/* ── Key type badge colors ──────────────────────────────────────── */
const KEY_TYPE_COLORS: Record<KeyType, "primary" | "secondary" | "success" | "default" | "info" | "warning"> = {
  Rsa: "primary",
  Ed25519: "secondary",
  Ecdsa: "info",
  Pem: "default",
};

const KEY_TYPE_LABELS: Record<KeyType, string> = {
  Rsa: "RSA",
  Ed25519: "Ed25519",
  Ecdsa: "ECDSA",
  Pem: "PEM",
};

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
    <Box
      sx={{
        position: "relative",
        width: "100%",
        maxWidth: 720,
        mx: "auto",
        flex: 1,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Key list */}
      {keys.length === 0 ? (
        <EmptyState
          icon={<VpnKeyIcon />}
          title="No SSH keys yet"
          body="Add a private key to connect to your servers."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenForm}>
              Add key
            </Button>
          }
        />
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
                  aria-label={`Delete key ${key.name}`}
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
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body1" fontWeight={600}>
                        {key.name}
                      </Typography>
                      <Chip
                        label={KEY_TYPE_LABELS[key.key_type] ?? key.key_type}
                        color={KEY_TYPE_COLORS[key.key_type] ?? "default"}
                        size="small"
                      />
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{ fontFamily: (t) => t.tokens.fontMono }}
                      >
                        {key.fingerprint}
                      </Typography>
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontVariantNumeric: "tabular-nums" }}
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

      {/* FAB to add key — hidden while the empty state shows its own CTA */}
      {keys.length > 0 && (
        <Fab
          color="primary"
          size="medium"
          aria-label="Add key"
          onClick={handleOpenForm}
          sx={{
            position: "fixed",
            right: 20,
            bottom: (t) => `calc(env(safe-area-inset-bottom, 0px) + ${t.tokens.dock.fabOffset}px)`,
            transition: "transform 0.2s ease",
            "&:active": { transform: "scale(0.92)" },
          }}
        >
          <AddIcon />
        </Fab>
      )}

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
            borderRadius: (t) => t.tokens.radius.xl,
            bgcolor: "background.paper",
            backgroundImage: "none",
            maxHeight: "85dvh",
            overflow: "auto",
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
              borderRadius: (t) => t.tokens.radius.pill,
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
          <Typography variant="h6" fontWeight={650} sx={{ fontSize: "1.0625rem" }}>
            Add SSH key
          </Typography>
          <IconButton
            size="small"
            aria-label="Close"
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
            label="Private Key"
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
                fontFamily: (t) => t.tokens.fontMono,
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
          <Stack direction="row" spacing={1} sx={{ pt: 0.5, justifyContent: "flex-end" }}>
            <Button onClick={handleCloseForm} disabled={loading} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleStoreKey}
              disabled={!isFormValid || loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {loading ? "Saving…" : "Save key"}
            </Button>
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
            borderRadius: (t) => t.tokens.radius.xl,
            bgcolor: "background.paper",
            backgroundImage: "none",
            maxHeight: "80dvh",
          },
        }}
      >
        {/* Top pill accent */}
        <Box sx={{ display: "flex", justifyContent: "center", pt: 1.5, pb: 0.5 }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: (t) => t.tokens.radius.pill,
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
            <Typography variant="h6" fontWeight={650} sx={{ fontSize: "1.0625rem" }}>
              Key details
            </Typography>
          </Box>
          <IconButton
            size="small"
            aria-label="Close"
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
                Type
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  label={KEY_TYPE_LABELS[viewingKey.key_type] ?? viewingKey.key_type}
                  color={KEY_TYPE_COLORS[viewingKey.key_type] ?? "default"}
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Fingerprint
              </Typography>
              <Typography
                variant="body2"
                sx={{ wordBreak: "break-all", fontFamily: (t) => t.tokens.fontMono, fontSize: "0.75rem" }}
              >
                {viewingKey.fingerprint}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Created
              </Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {new Date(viewingKey.created_at).toLocaleString()}
              </Typography>
            </Box>
            {viewingKeyPem && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Private key (PEM)
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    mt: 0.5,
                    bgcolor: "action.hover",
                    borderRadius: (t) => t.tokens.radius.sm,
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      fontFamily: (t) => t.tokens.fontMono,
                      fontSize: "0.75rem",
                    }}
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
          sx={{ width: "100%", borderRadius: (t) => t.tokens.radius.md }}
        >
          {snackMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
