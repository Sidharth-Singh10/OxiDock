import { useState } from "react";
import {
  AppBar,
  Box,
  ButtonBase,
  Collapse,
  Divider,
  SwipeableDrawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import FolderIcon from "@mui/icons-material/Folder";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import DnsIcon from "@mui/icons-material/Dns";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import SettingsIcon from "@mui/icons-material/Settings";
import PaletteIcon from "@mui/icons-material/Palette";
import CheckIcon from "@mui/icons-material/Check";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import KeyManager from "./components/KeyManager";
import ServerList from "./components/ServerList";
import FileBrowser from "./components/FileBrowser";
import { useAppTheme } from "./theme/ThemeContext";

const DRAWER_WIDTH = 280;

function App() {
  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    serverName: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState(0);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [catExpanded, setCatExpanded] = useState(false);

  const { themeName, setThemeName, availableThemes } = useAppTheme();

  const handleConnect = (sessionId: string, serverName: string) => {
    setActiveSession({ sessionId, serverName });
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
        bgcolor: "background.default",
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
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 1.5, color: "text.primary" }}
          >
            <MenuIcon />
          </IconButton>
          {activeSession ? (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1, overflow: "hidden" }}>
              <FolderIcon sx={{ color: "primary.main", fontSize: 22 }} />
              <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1 }}>
                {activeSession.serverName}
              </Typography>
              <IconButton
                size="small"
                onClick={handleDisconnect}
                sx={{ color: "error.main", flexShrink: 0 }}
              >
                <PowerSettingsNewIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
              OxiDock
            </Typography>
          )}
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
      <SwipeableDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpen={() => setDrawerOpen(true)}
        swipeAreaWidth={60}
        minFlingVelocity={250}
        hysteresis={0.3}
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
            <Typography variant="h6" fontWeight={700}>
              OxiDock
            </Typography>
            <Typography variant="caption" color="text.secondary">
              VPS File Browser
            </Typography>
          </Box>
          <IconButton size="small" sx={{ color: "text.secondary" }}>
            <SettingsIcon fontSize="small" />
          </IconButton>
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
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <VpnKeyIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              </ListItemIcon>
              <ListItemText primary="Manage Keys" />
            </ListItemButton>
          </ListItem>

          {/* Theme picker toggle */}
          <ListItem disablePadding>
            <ListItemButton onClick={() => setThemeExpanded(!themeExpanded)}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <PaletteIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              </ListItemIcon>
              <ListItemText primary="Color Scheme" />
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
          <List dense disablePadding sx={{ pl: 2 }}>
            {/* Standalone themes (e.g. Tokyo Night) */}
            {standalone.map((t) => (
              <ListItem key={t.key} disablePadding>
                <ListItemButton
                  onClick={() => setThemeName(t.key)}
                  selected={themeName === t.key}
                  sx={{ py: 0.5, borderRadius: "10px", mx: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: "6px",
                        bgcolor: t.key === "tokyonight" ? "#7aa2f7" : "primary.main",
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
                      sx={{ py: 0.5, borderRadius: "10px", mx: 1 }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Box
                          sx={{
                            width: 18,
                            height: 18,
                            borderRadius: "6px",
                            bgcolor: "#cba6f7",
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
                      {isGroupActive && (
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
                    <List dense disablePadding sx={{ pl: 2 }}>
                      {variants.map((v) => (
                        <ListItem key={v.key} disablePadding>
                          <ListItemButton
                            onClick={() => setThemeName(v.key)}
                            selected={themeName === v.key}
                            sx={{ py: 0.25, borderRadius: "10px", mx: 1 }}
                          >
                            <ListItemText
                              primary={
                                <Typography variant="caption" fontWeight={themeName === v.key ? 600 : 400}>
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
          pb: !activeSession ? "80px" : 0,
        }}
      >
        {activeSession ? (
          <FileBrowser
            sessionId={activeSession.sessionId}
            serverName={activeSession.serverName}
            onDisconnect={handleDisconnect}
          />
        ) : bottomTab === 0 ? (
          <Box sx={{ p: 2, flex: 1 }}>
            <ServerList onConnect={handleConnect} variant="page" />
          </Box>
        ) : (
          <Box sx={{ p: 2, flex: 1 }}>
            <KeyManager />
          </Box>
        )}
      </Box>

      {/* Glass Blur Dock — only when not connected */}
      {!activeSession && (
        <Box
          sx={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1200,
            display: "flex",
            justifyContent: "center",
            gap: 1,
            px: 3,
            py: 1,
            borderRadius: "9999px",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            bgcolor: "rgba(30, 30, 46, 0.55)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
            mb: "env(safe-area-inset-bottom, 0px)",
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
                onClick={() => setBottomTab(tab.index)}
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.3,
                  py: 0.8,
                  px: 2,
                  borderRadius: "14px",
                  bgcolor: isActive
                    ? "rgba(255, 255, 255, 0.1)"
                    : "transparent",
                  color: isActive ? "primary.main" : "text.secondary",
                  transition: "all 0.25s ease",
                  "&:hover": {
                    bgcolor: "rgba(255, 255, 255, 0.06)",
                  },
                  "& .MuiSvgIcon-root": {
                    fontSize: 22,
                    transition: "transform 0.25s ease",
                    transform: isActive ? "scale(1.1)" : "scale(1)",
                  },
                }}
              >
                {tab.icon}
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "0.65rem",
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: 0.3,
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
    </Box>
  );
}

export default App;
