import {
  Box,
  Checkbox,
  FormControlLabel,
  Popover,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ViewListIcon from "@mui/icons-material/ViewList";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewHeadlineIcon from "@mui/icons-material/ViewHeadline";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import StorageIcon from "@mui/icons-material/Storage";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";

import type { ViewSettings, ViewMode, SortBy } from "../lib/types";

interface Props {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  settings: ViewSettings;
  onChange: (settings: ViewSettings) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      fontWeight={600}
      color="text.secondary"
      sx={{ px: 0.5, mb: 0.5, display: "block", letterSpacing: 0.3 }}
    >
      {children}
    </Typography>
  );
}

export default function ViewOptionsPopover({
  anchorEl,
  open,
  onClose,
  settings,
  onChange,
}: Props) {
  const update = (patch: Partial<ViewSettings>) =>
    onChange({ ...settings, ...patch });

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            width: 280,
            p: 2.5,
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
          },
        },
      }}
    >
      {/* View mode */}
      <Box>
        <SectionLabel>View mode</SectionLabel>
        <ToggleButtonGroup
          value={settings.viewMode}
          exclusive
          onChange={(_, v: ViewMode | null) => v && update({ viewMode: v })}
          fullWidth
          size="small"
          sx={{
            "& .MuiToggleButton-root": {
              flex: 1,
              gap: 0.5,
              textTransform: "none",
              borderRadius: "10px !important",
              border: "none",
              py: 1,
              fontSize: "0.75rem",
              "&.Mui-selected": {
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "&:hover": { bgcolor: "primary.dark" },
              },
            },
          }}
        >
          <ToggleButton value="list">
            <ViewListIcon fontSize="small" />
            List
          </ToggleButton>
          <ToggleButton value="grid">
            <GridViewIcon fontSize="small" />
            Grid
          </ToggleButton>
          <ToggleButton value="compact">
            <ViewHeadlineIcon fontSize="small" />
            Compact
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Sort mode */}
      <Box>
        <SectionLabel>Sort mode</SectionLabel>
        <ToggleButtonGroup
          value={settings.sortBy}
          exclusive
          onChange={(_, v: SortBy | null) => v && update({ sortBy: v })}
          fullWidth
          size="small"
          sx={{
            "& .MuiToggleButton-root": {
              flex: 1,
              gap: 0.5,
              textTransform: "none",
              borderRadius: "10px !important",
              border: "none",
              py: 1,
              fontSize: "0.75rem",
              flexDirection: "column",
              "&.Mui-selected": {
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "&:hover": { bgcolor: "primary.dark" },
              },
            },
          }}
        >
          <ToggleButton value="name">
            <SortByAlphaIcon fontSize="small" />
            Name
          </ToggleButton>
          <ToggleButton value="date">
            <CalendarTodayIcon sx={{ fontSize: 18 }} />
            Date
          </ToggleButton>
          <ToggleButton value="size">
            <StorageIcon fontSize="small" />
            Size
          </ToggleButton>
          <ToggleButton value="type">
            <InsertDriveFileIcon fontSize="small" />
            Type
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* List zooming */}
      <Box>
        <SectionLabel>List zooming</SectionLabel>
        <Box sx={{ px: 1 }}>
          <Slider
            value={settings.zoomLevel}
            onChange={(_, v) => update({ zoomLevel: v as number })}
            min={0}
            max={100}
            step={1}
            size="small"
          />
        </Box>
      </Box>

      {/* Options */}
      <Box>
        <SectionLabel>Options</SectionLabel>
        <FormControlLabel
          control={
            <Checkbox
              checked={settings.onlyThisFolder}
              onChange={(_, checked) => update({ onlyThisFolder: checked })}
              size="small"
            />
          }
          label={
            <Typography variant="body2">Only this folder</Typography>
          }
          sx={{ ml: 0 }}
        />
      </Box>
    </Popover>
  );
}
