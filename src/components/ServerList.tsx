import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  Divider,
  Fab,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import DnsIcon from "@mui/icons-material/Dns";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import StorageIcon from "@mui/icons-material/Storage";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import PasswordIcon from "@mui/icons-material/Password";
import NetworkCheckIcon from "@mui/icons-material/NetworkCheck";
import type { AuthMethod, KeyInfo, ServerConfig } from "../lib/types";
import {
  loadServers,
  addServer,
  removeServer,
  generateId,
} from "../lib/storage";

// Styled icon wrapper matching reference file manager rounded-square style
function IconWrap({ children, color = "primary.main", bgAlpha = "1a" }: {
  children: React.ReactNode;
  color?: string;
  bgAlpha?: string;
}) {
  return (
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: (theme) => {
          const resolved = color.split(".").reduce((obj: any, key) => obj?.[key], theme.palette);
          return resolved ? `${resolved}${bgAlpha}` : `${color}${bgAlpha}`;
        },
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  );
}

interface Props {
  onConnect: (sessionId: string, serverName: string, mountPoint?: string) => void;
  variant?: "drawer" | "page";
  onClose?: () => void;
}

export default function ServerList({ onConnect, variant = "page", onClose: _onClose }: Props) {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add server form
  const [newName, setNewName] = useState("");
  const [newHost, setNewHost] = useState("");
  const [newPort, setNewPort] = useState("22");
  const [newUser, setNewUser] = useState("");
  const [newAuthMethod, setNewAuthMethod] = useState<AuthMethod>("key");
  const [newKey, setNewKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newMountPoint, setNewMountPoint] = useState("/home/");
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setServers(loadServers());
    invoke<KeyInfo[]>("list_keys").then(setKeys).catch(console.error);
  }, []);

  // Re-fetch keys every time the Add Server dialog opens
  useEffect(() => {
    if (modalOpen) {
      invoke<KeyInfo[]>("list_keys").then(setKeys).catch(console.error);
      setTestResult(null);
    }
  }, [modalOpen]);

  const handleTestConnection = async () => {
    if (!newHost || !newUser) return;
    if (newAuthMethod === "key" && !newKey) return;
    if (newAuthMethod === "password" && !newPassword) return;

    setTesting(true);
    setTestResult(null);
    try {
      await invoke("ssh_test_connection", {
        host: newHost,
        port: parseInt(newPort) || 22,
        user: newUser,
        keyName: newAuthMethod === "key" ? newKey : null,
        passphrase: null,
        password: newAuthMethod === "password" ? newPassword : null,
      });
      setTestResult({ ok: true, message: "Connection successful" });
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleAddServer = () => {
    if (!newName || !newHost || !newUser) return;
    if (newAuthMethod === "key" && !newKey) return;
    if (newAuthMethod === "password" && !newPassword) return;
    const server: ServerConfig = {
      id: generateId(),
      name: newName,
      host: newHost,
      port: parseInt(newPort) || 22,
      username: newUser,
      authMethod: newAuthMethod,
      keyName: newAuthMethod === "key" ? newKey : undefined,
      password: newAuthMethod === "password" ? newPassword : undefined,
      defaultMountPoint: newMountPoint || undefined,
      isDefault: newIsDefault,
    };
    setServers(addServer(server));
    setModalOpen(false);
    setNewName("");
    setNewHost("");
    setNewPort("22");
    setNewUser("");
    setNewAuthMethod("key");
    setNewKey("");
    setNewPassword("");
    setNewMountPoint("/home/");
    setNewIsDefault(false);
    setTestResult(null);
  };

  const handleRemoveServer = (id: string) => {
    setServers(removeServer(id));
  };

  const handleConnect = async (server: ServerConfig) => {
    setConnecting(server.id);
    setError(null);
    try {
      const sessionId = await invoke<string>("ssh_connect", {
        host: server.host,
        port: server.port,
        user: server.username,
        keyName: server.authMethod === "key" ? server.keyName : null,
        passphrase: null,
        password: server.authMethod === "password" ? server.password : null,
      });
      onConnect(sessionId, server.name, server.defaultMountPoint);
    } catch (e) {
      setError(`Failed to connect to ${server.name}: ${e}`);
    } finally {
      setConnecting(null);
    }
  };

  // ── Drawer variant: compact list for the sidebar ──
  if (variant === "drawer") {
    return (
      <>
        <List dense>
          <ListSubheader
            sx={{
              bgcolor: "transparent",
              fontWeight: 600,
              lineHeight: "36px",
            }}
          >
            SERVERS
          </ListSubheader>
          {servers.map((server) => (
            <ListItem
              key={server.id}
              disablePadding
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveServer(server.id);
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemButton
                onClick={() => handleConnect(server)}
                disabled={connecting === server.id}
                sx={{ py: 1 }}
              >
                <ListItemIcon sx={{ minWidth: 48 }}>
                  <IconWrap color="info.main">
                    <DnsIcon sx={{ fontSize: 20, color: "info.main" }} />
                  </IconWrap>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={500}>
                      {server.name}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                      {server.username}@{server.host}
                    </Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
          <ListItem disablePadding>
            <ListItemButton onClick={() => setModalOpen(true)} sx={{ py: 1 }}>
              <ListItemIcon sx={{ minWidth: 48 }}>
                <IconWrap color="primary.main">
                  <AddIcon sx={{ fontSize: 20, color: "primary.main" }} />
                </IconWrap>
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="body2" color="primary" fontWeight={500}>
                    Add Server
                  </Typography>
                }
              />
            </ListItemButton>
          </ListItem>
        </List>

        {error && (
          <Box sx={{ px: 2, pb: 1 }}>
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          </Box>
        )}

        {/* Shared Dialog */}
        {renderAddDialog()}
      </>
    );
  }

  // ── Page variant: full-page card grid ──
  return (
    <Box>
      {error && (
        <Card sx={{ mb: 2, bgcolor: "error.main", color: "error.contrastText" }}>
          <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
            <Typography variant="body2">{error}</Typography>
          </CardContent>
        </Card>
      )}

      {servers.length === 0 ? (
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
            <StorageIcon sx={{ fontSize: 36, color: "text.secondary", opacity: 0.6 }} />
          </Box>
          <Typography variant="subtitle1" fontWeight={600}>
            No servers yet
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 240 }}>
            Add a server to start browsing remote files
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setModalOpen(true)}
            sx={{ mt: 1 }}
          >
            Add Server
          </Button>
        </Box>
      ) : (
        <>
          <List disablePadding sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {servers.map((server) => (
              <ListItem
                key={server.id}
                disablePadding
                secondaryAction={
                  connecting === server.id ? (
                    <Typography variant="caption" color="primary">
                      Connecting...
                    </Typography>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConnect(server);
                      }}
                      sx={{
                        borderRadius: "20px",
                        textTransform: "none",
                        fontWeight: 500,
                        px: 2,
                        mr: -1,
                      }}
                    >
                      Connect
                    </Button>
                  )
                }
              >
                <ListItemButton
                  onClick={() => handleConnect(server)}
                  sx={{ minHeight: 56 }}
                >
                  <ListItemIcon sx={{ minWidth: 52 }}>
                    <IconWrap color="info.main">
                      <DnsIcon sx={{ fontSize: 22, color: "info.main" }} />
                    </IconWrap>
                  </ListItemIcon>
                  <ListItemText
                    primary={server.name}
                    secondary={
                      <Typography
                        component="span"
                        variant="caption"
                        fontFamily="monospace"
                        color="text.secondary"
                      >
                        {server.username}@{server.host}:{server.port}
                      </Typography>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <Fab
            color="primary"
            size="medium"
            onClick={() => setModalOpen(true)}
            sx={{
              position: "fixed",
              bottom: 80,
              right: 20,
            }}
          >
            <AddIcon />
          </Fab>
        </>
      )}

      {renderAddDialog()}
    </Box>
  );

  // ── Shared Add Server Dialog ──
  function renderAddDialog() {
    return (
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Add Server</DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              id="server-name-input"
              label="Display Name"
              placeholder="e.g. Production VPS"
              required
              fullWidth
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <TextField
              id="server-host-input"
              label="Host"
              placeholder="e.g. 192.168.1.100"
              required
              fullWidth
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
            />
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <TextField
                id="server-user-input"
                label="Username"
                placeholder="root"
                required
                fullWidth
                value={newUser}
                onChange={(e) => {
                  const user = e.target.value;
                  setNewUser(user);
                  setNewMountPoint(user ? `/home/${user}` : "/home/");
                }}
              />
              <TextField
                id="server-port-input"
                label="Port"
                value={newPort}
                onChange={(e) => setNewPort(e.target.value)}
                type="number"
                sx={{ width: 100 }}
              />
            </Box>
            <ToggleButtonGroup
              value={newAuthMethod}
              exclusive
              onChange={(_e, val) => { if (val) setNewAuthMethod(val as AuthMethod); }}
              fullWidth
              size="small"
              sx={{ borderRadius: "12px" }}
            >
              <ToggleButton
                value="key"
                sx={{
                  textTransform: "none",
                  gap: 0.75,
                  "&.Mui-selected": {
                    borderColor: "primary.main",
                    color: "primary.main",
                  },
                }}
              >
                <VpnKeyIcon fontSize="small" /> SSH Key
              </ToggleButton>
              <ToggleButton
                value="password"
                sx={{
                  textTransform: "none",
                  gap: 0.75,
                  "&.Mui-selected": {
                    borderColor: "primary.main",
                    color: "primary.main",
                  },
                }}
              >
                <PasswordIcon fontSize="small" /> Password
              </ToggleButton>
            </ToggleButtonGroup>
            {newAuthMethod === "key" ? (
              <>
                <TextField
                  id="server-key-select"
                  label="SSH Key"
                  select
                  required
                  fullWidth
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                >
                  {keys.map((k) => (
                    <MenuItem key={k.name} value={k.name}>
                      {k.name}
                    </MenuItem>
                  ))}
                </TextField>
                {keys.length === 0 && (
                  <Typography variant="caption" color="warning.main">
                    No keys available. Add an SSH key first in the Keys tab.
                  </Typography>
                )}
              </>
            ) : (
              <TextField
                id="server-password-input"
                label="Server Password"
                type="password"
                required
                fullWidth
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            )}
            <TextField
              id="server-mount-point-input"
              label="Default Mount Point"
              placeholder="/home/username"
              fullWidth
              value={newMountPoint}
              onChange={(e) => setNewMountPoint(e.target.value)}
              helperText="Starting directory when connected"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={newIsDefault}
                  onChange={(e) => setNewIsDefault(e.target.checked)}
                  color="primary"
                />
              }
              label="Connect on app start"
              slotProps={{
                typography: { variant: "body2" },
              }}
            />
            {testResult && (
              <Alert
                severity={testResult.ok ? "success" : "error"}
                variant="outlined"
                onClose={() => setTestResult(null)}
                sx={{ borderRadius: 2 }}
              >
                {testResult.message}
              </Alert>
            )}
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={
                  testing ||
                  !newHost ||
                  !newUser ||
                  (newAuthMethod === "key" ? !newKey : !newPassword)
                }
                startIcon={testing ? <CircularProgress size={18} /> : <NetworkCheckIcon />}
                sx={{ flex: 1, textTransform: "none" }}
              >
                {testing ? "Testing..." : "Test"}
              </Button>
              <Button
                id="save-server-btn"
                variant="contained"
                onClick={handleAddServer}
                disabled={
                  testing ||
                  !newName ||
                  !newHost ||
                  !newUser ||
                  (newAuthMethod === "key" ? !newKey : !newPassword)
                }
                sx={{ flex: 1 }}
              >
                Add Server
              </Button>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    );
  }
}
