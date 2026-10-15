import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { rgba } from "../theme/tokens";

interface Props {
  /** Icon element rendered inside the tinted tile — size is managed here. */
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  /** Compact variant for in-page empties (e.g. an empty directory). */
  compact?: boolean;
}

/**
 * Centered, self-balancing empty state.
 * Place inside a flex-column parent; `m: auto` centers it when there is room
 * and keeps it scrollable when there is not.
 */
export default function EmptyState({ icon, title, body, action, compact }: Props) {
  const tile = compact ? 64 : 92;
  const radius = compact ? "18px" : "26px";
  const glyph = compact ? 30 : 42;

  return (
    <Box
      sx={{
        m: "auto",
        width: "100%",
        maxWidth: 380,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        px: 3,
        py: compact ? 6 : { xs: 6, sm: 8 },
      }}
    >
      <Box
        sx={{
          width: tile,
          height: tile,
          borderRadius: radius,
          display: "grid",
          placeItems: "center",
          color: "primary.main",
          backgroundColor: (t) => alpha(t.palette.primary.main, 0.16),
          border: "1px solid",
          borderColor: (t) => alpha(t.palette.primary.main, 0.34),
          boxShadow: (t) =>
            [
              `inset 0 1px 0 0 ${alpha(t.palette.text.primary, 0.07)}`,
              `0 12px 30px -20px ${rgba(t.palette.primary.main, 0.7)}`,
            ].join(", "),
          mb: compact ? 1.5 : 2.5,
          "& .MuiSvgIcon-root": { fontSize: glyph },
        }}
      >
        {icon}
      </Box>
      <Typography
        variant={compact ? "subtitle1" : "h5"}
        fontWeight={650}
        sx={{ textWrap: "balance" }}
      >
        {title}
      </Typography>
      {body && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textWrap: "pretty", maxWidth: 320, mt: 1, lineHeight: 1.6 }}
        >
          {body}
        </Typography>
      )}
      {action && <Box sx={{ mt: compact ? 1.5 : 2.5 }}>{action}</Box>}
    </Box>
  );
}
