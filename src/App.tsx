import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Alert,
  AlertTitle,
  AppBar,
  Box,
  ButtonBase,
  CircularProgress,
  Collapse,
  Divider,
  SwipeableDrawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Toolbar,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import FolderIcon from "@mui/icons-material/Folder";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import DnsIcon from "@mui/icons-material/Dns";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import PaletteIcon from "@mui/icons-material/Palette";
import CheckIcon from "@mui/icons-material/Check";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import StorageIcon from "@mui/icons-material/Storage";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ViewListIcon from "@mui/icons-material/ViewList";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyManager from "./components/KeyManager";
import ServerList from "./components/ServerList";
import FileBrowser, { type FileBrowserBackHandle } from "./components/FileBrowser";
import ViewOptionsPopover from "./components/ViewOptionsPopover";
import FolderOptionsPopover from "./components/FolderOptionsPopover";
import { useAppTheme } from "./theme/ThemeContext";
import {
  getDefaultServer,
  loadViewSettings,
  saveViewSettings,
  loadFolderSettings,
  saveFolderSettings,
  loadLastFolder,
} from "./lib/storage";
import type { ViewSettings, FolderSettings } from "./lib/types";
import { registerBackEvent } from "@kingsword/tauri-plugin-mobile-onbackpressed-listener";
import { exit } from "@tauri-apps/plugin-process";

const DRAWER_WIDTH = 280;

function App() {
  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    serverName: string;
    mountPoint?: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState(0);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [catExpanded, setCatExpanded] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [autoConnectError, setAutoConnectError] = useState<string | null>(null);
  const [exitSnackbar, setExitSnackbar] = useState(false);
  const [viewSettings, setViewSettings] = useState<ViewSettings>(loadViewSettings);
  const [folderSettings, setFolderSettings] = useState<FolderSettings>(loadFolderSettings);
  const [dotMenuAnchor, setDotMenuAnchor] = useState<HTMLElement | null>(null);
  const [activePanel, setActivePanel] = useState<"view" | "folder" | null>(null);

  const handleViewSettingsChange = useCallback((next: ViewSettings) => {
    setViewSettings(next);
    saveViewSettings(next);
  }, []);

  const handleFolderSettingsChange = useCallback((next: FolderSettings) => {
    setFolderSettings(next);
    saveFolderSettings(next);
  }, []);

  const handleDotMenuClose = () => setDotMenuAnchor(null);
  const handlePanelClose = () => setActivePanel(null);
  const autoConnectDone = useRef(false);
  const fileBrowserBackRef = useRef<FileBrowserBackHandle | null>(null);
  const rootBackCountRef = useRef(0);

  // Refs for back handler to read current state synchronously
  const drawerOpenRef = useRef(drawerOpen);
  const themeExpandedRef = useRef(themeExpanded);
  const catExpandedRef = useRef(catExpanded);
  const activeSessionRef = useRef(activeSession);
  drawerOpenRef.current = drawerOpen;
  themeExpandedRef.current = themeExpanded;
  catExpandedRef.current = catExpanded;
  activeSessionRef.current = activeSession;

  const { themeName, setThemeName, availableThemes } = useAppTheme();

  // Android back gesture: navigate in-app, or exit on double-back at root
  useEffect(() => {
    let unlisten: Awaited<ReturnType<typeof registerBackEvent>> | undefined;
    const setup = async () => {
      try {
        unlisten = await registerBackEvent(() => {
          // 1. Drawer open → close drawer
          if (drawerOpenRef.current) {
            setDrawerOpen(false);
            return;
          }
          // 2. Theme/cat expanded in drawer → collapse
          if (themeExpandedRef.current || catExpandedRef.current) {
            setThemeExpanded(false);
            setCatExpanded(false);
            return;
          }
          // 3. Connected + FileBrowser can go back (preview or deeper path)
          if (activeSessionRef.current) {
            const fb = fileBrowserBackRef.current;
            if (fb?.canGoBack()) {
              fb.handleBack();
              return;
            }
            // 4. Connected + at FileBrowser root → disconnect
            setActiveSession(null);
            rootBackCountRef.current = 0;
            return;
          }
          // 5. At app root (ServerList/KeyManager) → double-back to exit
          if (rootBackCountRef.current === 0) {
            rootBackCountRef.current = 1;
            setExitSnackbar(true);
            return;
          }
          exit(0);
        });
      } catch {
        // Plugin not available on desktop
      }
    };
    setup();
    return () => {
      unlisten?.unregister();
    };
  }, []);

  useEffect(() => {
    if (autoConnectDone.current) return;
    autoConnectDone.current = true;

    const server = getDefaultServer();
    if (!server) return;

    setAutoConnecting(true);
    invoke<string>("ssh_connect", {
      host: server.host,
      port: server.port,
      user: server.username,
      keyName: server.authMethod === "key" ? server.keyName : null,
      passphrase: null,
      password: server.authMethod === "password" ? server.password : null,
    })
      .then((sessionId) => {
        setActiveSession({
          sessionId,
          serverName: server.name,
          mountPoint: server.defaultMountPoint,
        });
      })
      .catch((e) => {
        setAutoConnectError(String(e));
      })
      .finally(() => {
        setAutoConnecting(false);
      });
  }, []);

  const handleConnect = (sessionId: string, serverName: string, mountPoint?: string) => {
    setActiveSession({ sessionId, serverName, mountPoint });
    setAutoConnectError(null);
    setDrawerOpen(false);
  };

  const handleDisconnect = () => {
    setActiveSession(null);
  };

  // Group themes: standalone vs grouped (e.g. Catppuccin variants)
  const grouped = availableThemes.filter((t) => t.group);
  const standalone = availableThemes.filter((t) => !t.group);
  const groups = [...new Set(grouped.map((t) => t.group!))];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        // No background here — the body paints the base color + ambient glow.
      }}
    >
      {/* Top AppBar */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
          pt: "env(safe-area-inset-top, 24px)",
        }}
      >
        <Toolbar sx={{ minHeight: 56 }}>
          <IconButton
            edge="start"
            aria-label="Open menu"
            onClick={() => {
              setDrawerOpen(true);
              rootBackCountRef.current = 0;
            }}
            sx={{ mr: 1.5, color: "text.primary" }}
          >
            <MenuIcon />
          </IconButton>
          {activeSession ? (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1.25, overflow: "hidden" }}>
              <Box
                sx={{
                  width: 30,
                  height: 30,
                  borderRadius: "9px",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                }}
              >
                <FolderIcon sx={{ color: "primary.main", fontSize: 18 }} />
              </Box>
              <Typography variant="subtitle1" fontWeight={650} noWrap sx={{ flex: 1 }}>
                {activeSession.serverName}
              </Typography>
              <IconButton
                size="small"
                aria-label="View and folder options"
                onClick={(e) => setDotMenuAnchor(e.currentTarget)}
                sx={{ color: "text.secondary", flexShrink: 0 }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label="Disconnect"
                onClick={handleDisconnect}
                sx={{ color: "error.main", flexShrink: 0 }}
              >
                <PowerSettingsNewIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Typography variant="subtitle1" fontWeight={650} sx={{ flex: 1 }}>
              OxiDock
            </Typography>
          )}
        </Toolbar>
      </AppBar>

      {/* 3-dot top-level menu */}
      <Menu
        anchorEl={dotMenuAnchor}
        open={!!dotMenuAnchor && !activePanel}
        onClose={handleDotMenuClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { sx: { minWidth: 200, mt: 0.5 } },
        }}
      >
        <MenuItem
          onClick={() => {
            setDotMenuAnchor(dotMenuAnchor);
            setActivePanel("view");
          }}
        >
          <ListItemIcon>
            <ViewListIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>View options</ListItemText>
          <ChevronRightIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDotMenuAnchor(dotMenuAnchor);
            setActivePanel("folder");
          }}
        >
          <ListItemIcon>
            <FolderOpenIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Folder options</ListItemText>
          <ChevronRightIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </MenuItem>
      </Menu>

      {/* View options sub-popover */}
      <ViewOptionsPopover
        anchorEl={dotMenuAnchor}
        open={activePanel === "view"}
        onClose={() => {
          handlePanelClose();
          handleDotMenuClose();
        }}
        settings={viewSettings}
        onChange={handleViewSettingsChange}
      />

      {/* Folder options sub-popover */}
      <FolderOptionsPopover
        anchorEl={dotMenuAnchor}
        open={activePanel === "folder"}
        onClose={() => {
          handlePanelClose();
          handleDotMenuClose();
        }}
        settings={folderSettings}
        onChange={handleFolderSettingsChange}
      />

      {/* Sidebar Drawer */}
      <SwipeableDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpen={() => setDrawerOpen(true)}
        swipeAreaWidth={60}
        minFlingVelocity={250}
        hysteresis={0.3}
        SwipeAreaProps={{ sx: { zIndex: 1099 } }}
        sx={{
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            bgcolor: "background.default",
            borderRight: 1,
            borderColor: "divider",
          },
        }}
      >
        {/* Drawer header */}
        <Box
          sx={{
            pl: 2,
            pr: 2,
            pb: 1,
            pt: "calc(env(safe-area-inset-top, 24px) + 16px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={650}>
              OxiDock
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.02em" }}>
              VPS file browser
            </Typography>
          </Box>
        </Box>
        <Divider sx={{ mb: 0.5 }} />

        {/* Server list inside drawer */}
        <ServerList
          onConnect={handleConnect}
          variant="drawer"
          onClose={() => setDrawerOpen(false)}
        />

        <Divider />

        {/* Drawer nav items */}
        <List dense>
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => {
                setBottomTab(1);
                setDrawerOpen(false);
              }}
              sx={{ mx: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <VpnKeyIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              </ListItemIcon>
              <ListItemText primary="Manage keys" />
            </ListItemButton>
          </ListItem>

          {/* Theme picker toggle */}
          <ListItem disablePadding>
            <ListItemButton onClick={() => setThemeExpanded(!themeExpanded)} sx={{ mx: 1 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <PaletteIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              </ListItemIcon>
              <ListItemText primary="Color scheme" />
              {themeExpanded ? (
                <ExpandLessIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              )}
            </ListItemButton>
          </ListItem>
        </List>

        {/* Theme selection list */}
        <Collapse in={themeExpanded}>
          <List dense disablePadding>
            {/* Standalone themes (e.g. Tokyo Night) */}
            {standalone.map((t) => (
              <ListItem key={t.key} disablePadding>
                <ListItemButton
                  onClick={() => setThemeName(t.key)}
                  selected={themeName === t.key}
                  sx={{ py: 0.5, mx: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: "6px",
                        bgcolor: t.swatch,
                        border: 1,
                        borderColor: "divider",
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" fontWeight={themeName === t.key ? 600 : 400}>
                        {t.label}
                      </Typography>
                    }
                  />
                  {themeName === t.key && (
                    <CheckIcon sx={{ fontSize: 18, color: "primary.main" }} />
                  )}
                </ListItemButton>
              </ListItem>
            ))}

            {/* Grouped themes (e.g. Catppuccin -> Mocha, Latte, ...) */}
            {groups.map((groupName) => {
              const variants = grouped.filter((t) => t.group === groupName);
              const isGroupActive = variants.some((t) => t.key === themeName);
              return (
                <Box key={groupName}>
                  <ListItem disablePadding>
                    <ListItemButton
                      onClick={() => setCatExpanded(!catExpanded)}
                      sx={{ py: 0.5, mx: 1 }}
                    >
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <Box
                          sx={{
                            width: 18,
                            height: 18,
                            borderRadius: "6px",
                            bgcolor: variants[0]?.swatch ?? "primary.main",
                            border: 1,
                            borderColor: "divider",
                          }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={isGroupActive ? 600 : 400}>
                            {groupName}
                          </Typography>
                        }
                      />
                      {isGroupActive && !catExpanded && (
                        <CheckIcon sx={{ fontSize: 18, color: "primary.main", mr: 0.5 }} />
                      )}
                      {catExpanded ? (
                        <ExpandLessIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                      ) : (
                        <ExpandMoreIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                      )}
                    </ListItemButton>
                  </ListItem>

                  <Collapse in={catExpanded}>
                    <List dense disablePadding>
                      {variants.map((v) => (
                        <ListItem key={v.key} disablePadding>
                          <ListItemButton
                            onClick={() => setThemeName(v.key)}
                            selected={themeName === v.key}
                            sx={{ py: 0.5, mx: 1, pl: 9 }}
                          >
                            <ListItemText
                              primary={
                                <Typography variant="body2" fontWeight={themeName === v.key ? 600 : 400}>
                                  {v.variant || v.label}
                                </Typography>
                              }
                            />
                            {themeName === v.key && (
                              <CheckIcon sx={{ fontSize: 16, color: "primary.main" }} />
                            )}
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </Box>
              );
            })}
          </List>
        </Collapse>
      </SwipeableDrawer>

      {/* Main content */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          pb: (t) =>
            !activeSession && !autoConnecting
              ? `calc(env(safe-area-inset-bottom, 0px) + ${t.tokens.dock.clearance}px)`
              : 0,
        }}
      >
        {autoConnecting ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              p: 4,
            }}
          >
            <Box
              sx={{
                width: 88,
                height: 88,
                borderRadius: (t) => t.tokens.radius.xl,
                display: "grid",
                placeItems: "center",
                bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                border: "1px solid",
                borderColor: (t) => alpha(t.palette.primary.main, 0.22),
                position: "relative",
              }}
            >
              <StorageIcon sx={{ fontSize: 40, color: "primary.main" }} />
              <CircularProgress
                size={96}
                thickness={2}
                sx={{
                  position: "absolute",
                  color: "primary.main",
                  opacity: 0.55,
                }}
              />
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h6" fontWeight={650} gutterBottom>
                Connecting…
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {getDefaultServer()?.name ?? "Default server"}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: "block", fontFamily: (t) => t.tokens.fontMono }}
              >
                {getDefaultServer()?.username}@{getDefaultServer()?.host}
              </Typography>
            </Box>
          </Box>
        ) : activeSession ? (
          <FileBrowser
            sessionId={activeSession.sessionId}
            serverName={activeSession.serverName}
            onDisconnect={handleDisconnect}
            initialPath={activeSession.mountPoint || (folderSettings.rememberLastFolder ? loadLastFolder() ?? undefined : undefined)}
            onBackRef={fileBrowserBackRef}
            viewSettings={viewSettings}
            folderSettings={folderSettings}
          />
        ) : (
          <>
            {autoConnectError && (
              <Box sx={{ px: 2, pt: 2 }}>
                <Alert severity="error" variant="outlined">
                  <AlertTitle sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    Auto-connect failed
                  </AlertTitle>
                  {autoConnectError}
                </Alert>
              </Box>
            )}
            <Box
              sx={{
                p: 2,
                flex: 1,
                display: bottomTab === 0 ? "flex" : "none",
                flexDirection: "column",
              }}
            >
              <ServerList onConnect={handleConnect} variant="page" />
            </Box>
            <Box
              sx={{
                p: 2,
                flex: 1,
                display: bottomTab === 1 ? "flex" : "none",
                flexDirection: "column",
              }}
            >
              <KeyManager />
            </Box>
          </>
        )}
      </Box>

      {/* Glass dock — only when not connected */}
      {!activeSession && !autoConnecting && (
        <Box
          component="nav"
          aria-label="Primary"
          sx={{
            position: "fixed",
            zIndex: (t) => t.tokens.z.dock,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
            left: "50%",
            width: { xs: "min(320px, calc(100% - 64px))", sm: "auto" },
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            p: 0.75,
            borderRadius: (t) => t.tokens.radius.pill,
            bgcolor: (t) => t.tokens.glass.bg,
            border: "1px solid",
            borderColor: (t) => t.tokens.glass.border,
            boxShadow: (t) => t.tokens.glass.shadow,
            // No backdrop-filter: with an 86%-opaque fill the blur is invisible,
            // and fixed backdrop-filter layers corrupt on some WebView compositors
            // (reproducible in software-rendered Chromium after tab switches).
          }}
        >
          {[
            { label: "Browse", icon: <DnsIcon />, index: 0 },
            { label: "Keys", icon: <VpnKeyIcon />, index: 1 },
          ].map((tab) => {
            const isActive = bottomTab === tab.index;
            return (
              <ButtonBase
                key={tab.index}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setBottomTab(tab.index)}
                sx={{
                  flex: { xs: 1, sm: "0 0 auto" },
                  width: { sm: 116 },
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.4,
                  py: 0.9,
                  px: 1.5,
                  borderRadius: (t) => t.tokens.radius.md,
                  bgcolor: (t) => (isActive ? t.tokens.glass.activeFill : "transparent"),
                  color: isActive
                    ? "primary.main"
                    : (t) => alpha(t.palette.text.primary, 0.7),
                  transition: (t) =>
                    t.transitions.create(["background-color", "color"], { duration: 200 }),
                  "&:hover": {
                    bgcolor: (t) =>
                      isActive
                        ? alpha(t.palette.primary.main, 0.22)
                        : t.tokens.glass.hoverFill,
                  },
                  "& .MuiSvgIcon-root": {
                    fontSize: 22,
                    transition: "transform 200ms ease",
                    transform: isActive ? "scale(1.06)" : "scale(1)",
                  },
                }}
              >
                {tab.icon}
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "0.75rem",
                    fontWeight: isActive ? 650 : 500,
                    letterSpacing: "0.01em",
                    lineHeight: 1,
                  }}
                >
                  {tab.label}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
      )}

      <Snackbar
        open={exitSnackbar}
        autoHideDuration={2000}
        onClose={() => {
          setExitSnackbar(false);
          rootBackCountRef.current = 0;
        }}
        message="Press back again to exit"
      />
    </Box>
  );
}

export default App;
