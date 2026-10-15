/* ── Design tokens ──────────────────────────────────────────────────────────
 * Every theme gets the same token *structure*, so component code never hardcodes
 * a color, radius, shadow or z-index that only works in one theme.
 * ────────────────────────────────────────────────────────────────────────── */

declare module '@mui/material/styles' {
  interface Theme {
    tokens: AppTokens;
  }
  interface ThemeOptions {
    tokens?: AppTokens;
  }
}

/** The slice of the palette the token factory needs. */
export interface TokenPalette {
  text: { primary: string };
  primary: { main: string };
}

export interface AppTokens {
  /** Border-radius scale, in px strings so sx never multiplies them silently. */
  radius: {
    xs: string; // chips, skeleton blocks
    sm: string; // buttons, inputs, list items
    md: string; // cards, menus, popovers, dock tabs
    lg: string; // dialogs
    xl: string; // sheets, hero tiles
    pill: string;
  };
  /** Z-index scale. Keep MUI's own layers in mind: drawer 1200, modal 1300. */
  z: {
    dock: number;
    fabBackdrop: number;
    fab: number;
    overlay: number; // full-screen viewers, blocking backdrops
    grain: number; // global texture overlay
  };
  /** Frosted-glass surfaces (dock, image viewer chrome). */
  glass: {
    bg: string;
    border: string;
    shadow: string;
    activeFill: string;
    hoverFill: string;
  };
  /** Modal / blocking backdrop color. */
  scrim: string;
  /** Tinted shadows — carry the theme's hue instead of pure black. */
  shadow: {
    soft: string;
    medium: string;
    strong: string;
  };
  /** Focus ring color for :focus-visible. */
  focusRing: string;
  fontMono: string;
  /** Bottom dock geometry (px numbers so `calc()` strings stay readable). */
  dock: {
    height: number;
    gap: number;
    clearance: number; // space content must reserve under the dock
    fabOffset: number; // FAB bottom offset while the dock is visible
  };
  /** FAB bottom offset when there is no dock (file browser). */
  fabOffset: number;
  ambient: {
    /** Ambient background glows layered behind all content. */
    glow: string;
    /** SVG noise data-URI for the texture overlay. */
    grain: string;
    grainOpacity: number;
  };
}

/** Convert #rgb / #rrggbb to an rgba() string. Non-hex input passes through. */
export function rgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export const FONT_SANS =
  '"Geist Variable", "Geist", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONT_MONO =
  '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export interface TokenAnchors {
  /** Base color the frosted surfaces are mixed from (should sit *above* the page bg). */
  glassBase: string;
  /** Very dark color used for scrims and shadow tints. */
  scrimBase: string;
  /** Primary ambient glow (usually the theme accent). */
  glowPrimary: string;
  /** Secondary ambient glow (usually the theme's second accent). */
  glowSecondary: string;
  grainOpacity?: number;
}

export function createTokens(palette: TokenPalette, anchors: TokenAnchors): AppTokens {
  const { glassBase, scrimBase, glowPrimary, glowSecondary, grainOpacity = 0.08 } = anchors;
  const fg = palette.text.primary;
  const accent = palette.primary.main;

  return {
    radius: {
      xs: '8px',
      sm: '10px',
      md: '14px',
      lg: '18px',
      xl: '22px',
      pill: '999px',
    },
    z: {
      dock: 1150,
      fabBackdrop: 1160,
      fab: 1170,
      overlay: 2000,
      grain: 5000,
    },
    glass: {
      bg: rgba(glassBase, 0.86),
      border: rgba(fg, 0.2),
      shadow: [
        `0 12px 32px -8px ${rgba(scrimBase, 0.55)}`,
        `0 2px 6px 0 ${rgba(scrimBase, 0.35)}`,
        `inset 0 1px 0 0 ${rgba(fg, 0.07)}`,
      ].join(', '),
      activeFill: rgba(accent, 0.18),
      hoverFill: rgba(fg, 0.08),
    },
    scrim: rgba(scrimBase, 0.62),
    shadow: {
      soft: `0 2px 8px ${rgba(scrimBase, 0.35)}`,
      medium: `0 6px 20px ${rgba(scrimBase, 0.45)}`,
      strong: `0 14px 40px ${rgba(scrimBase, 0.55)}`,
    },
    focusRing: rgba(accent, 0.65),
    fontMono: FONT_MONO,
    dock: {
      height: 64,
      gap: 16,
      clearance: 96, // height + gap + breathing room
      fabOffset: 100, // clearance + 4, keeps FAB just above the dock
    },
    fabOffset: 28,
    ambient: {
      glow: [
        `radial-gradient(1000px 660px at 78% 20%, ${rgba(glowPrimary, 0.16)}, transparent 62%)`,
        `radial-gradient(880px 600px at 2% 94%, ${rgba(glowSecondary, 0.13)}, transparent 58%)`,
        `radial-gradient(760px 520px at 6% 14%, ${rgba(glowSecondary, 0.11)}, transparent 55%)`,
        `radial-gradient(820px 560px at 96% 96%, ${rgba(glowPrimary, 0.12)}, transparent 58%)`,
      ].join(', '),
      grain: GRAIN,
      grainOpacity,
    },
  };
}
