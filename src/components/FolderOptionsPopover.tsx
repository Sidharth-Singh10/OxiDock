import {
  Box,
  Checkbox,
  FormControlLabel,
  Popover,
  Typography,
} from "@mui/material";

import type { FolderSettings } from "../lib/types";

interface Props {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  settings: FolderSettings;
  onChange: (settings: FolderSettings) => void;
}

const OPTIONS: { key: keyof FolderSettings; label: string }[] = [
  { key: "showHiddenFiles", label: "Show hidden files" },
  { key: "foldersFirst", label: "Folders first" },
  { key: "rememberLastFolder", label: "Remember last folder" },
  { key: "showFoldersSize", label: "Show folders size" },
];

export default function FolderOptionsPopover({
  anchorEl,
  open,
  onClose,
  settings,
  onChange,
}: Props) {
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
            gap: 0.5,
          },
        },
      }}
    >
      <Typography
        variant="caption"
        fontWeight={600}
        color="text.secondary"
        sx={{ px: 0.5, mb: 0.5, letterSpacing: 0.3 }}
      >
        Folder options
      </Typography>

      {OPTIONS.map(({ key, label }) => (
        <FormControlLabel
          key={key}
          control={
            <Checkbox
              checked={settings[key]}
              onChange={(_, checked) =>
                onChange({ ...settings, [key]: checked })
              }
              size="small"
            />
          }
          label={<Typography variant="body2">{label}</Typography>}
          sx={{ ml: 0 }}
        />
      ))}
    </Popover>
  );
}
