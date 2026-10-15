import type { ThemeOptions } from '@mui/material/styles';
import { createTokens, rgba, FONT_SANS } from './tokens';
import type { TokenAnchors } from './tokens';

/* ── App palette contract ───────────────────────────────────────────────────
 * Both themes provide the same complete palette shape, so the token factory
 * and every component override can rely on non-optional fields.
 * ────────────────────────────────────────────────────────────────────────── */

export interface AppPalette {
  mode: 'dark';
  primary: { main: string; light: string; dark: string; contrastText: string };
  secondary: { main: string; light: string; dark: string; contrastText: string };
  error: { main: string; light: string; dark: string; contrastText: string };
  warning: { main: string; light: string; dark: string; contrastText: string };
  success: { main: string; light: string; dark: string; contrastText: string };
  info: { main: string; light: string; dark: string; contrastText: string };
  background: { default: string; paper: string };
  text: { primary: string; secondary: string; disabled: string };
  divider: string;
  action: {
    hover: string;
    selected: string;
    disabled: string;
    disabledBackground: string;
    focus: string;
  };
}

/* ── Shared theme builder ────────────────────────────────────────────────── */

export function buildTheme(palette: AppPalette, anchors: TokenAnchors): ThemeOptions {
  const tokens = createTokens(palette, anchors);
  const accent = palette.primary.main;
  const fg = palette.text.primary;

  const focusVisible = {
    outline: `2px solid ${tokens.focusRing}`,
    outlineOffset: 2,
  };

  return {
    palette,
    tokens,
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: FONT_SANS,
      h4: { fontSize: '1.875rem', fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.2 },
      h5: { fontSize: '1.625rem', fontWeight: 650, letterSpacing: '-0.015em', lineHeight: 1.25 },
      h6: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 },
      subtitle1: { fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.005em' },
      subtitle2: { fontSize: '0.875rem', fontWeight: 600 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', lineHeight: 1.55 },
      caption: { fontSize: '0.75rem', lineHeight: 1.45, letterSpacing: '0.01em' },
      overline: { fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1.6 },
      button: { fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.005em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: 'dark' },
          ':is(h1, h2, h3, h4, h5, h6)': { textWrap: 'balance' },
          p: { textWrap: 'pretty' },
          '::selection': { backgroundColor: rgba(accent, 0.28) },
          // Visible keyboard focus for every MUI button-like control.
          'button:focus-visible, a:focus-visible, [role="button"]:focus-visible, .MuiButtonBase-root.Mui-focusVisible':
            focusVisible,
          body: {
            backgroundColor: palette.background.default,
            color: palette.text.primary,
            backgroundImage: tokens.ambient.glow,
            backgroundAttachment: 'fixed',
            backgroundRepeat: 'no-repeat',
            scrollbarColor: `${palette.action.selected} ${palette.background.default}`,
          },
          // Global film grain — breaks up flat digital surfaces, sits above content.
          'body::after': {
            content: '""',
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: tokens.z.grain,
            backgroundImage: tokens.ambient.grain,
            backgroundRepeat: 'repeat',
            opacity: tokens.ambient.grainOpacity,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderColor: palette.divider,
          },
        },
        defaultProps: { elevation: 0 },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: tokens.radius.md,
            border: `1px solid ${palette.divider}`,
            backgroundImage: 'none',
            boxShadow: tokens.shadow.medium,
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            borderRadius: tokens.radius.md,
            border: `1px solid ${palette.divider}`,
            backgroundImage: 'none',
            boxShadow: tokens.shadow.medium,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            backgroundColor: palette.background.default,
            border: `1px solid ${palette.divider}`,
            borderRadius: tokens.radius.lg,
            boxShadow: tokens.shadow.strong,
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: tokens.scrim,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: tokens.radius.sm,
          },
          containedPrimary: {
            backgroundColor: palette.primary.main,
            color: palette.primary.contrastText,
            '&:hover': { backgroundColor: palette.primary.light },
          },
          containedError: {
            backgroundColor: palette.error.main,
            color: palette.error.contrastText,
            '&:hover': { backgroundColor: palette.error.light },
          },
          outlinedPrimary: {
            borderColor: rgba(accent, 0.5),
            color: palette.primary.main,
            '&:hover': {
              borderColor: palette.primary.main,
              backgroundColor: rgba(accent, 0.08),
            },
          },
          textPrimary: {
            color: palette.primary.main,
            '&:hover': { backgroundColor: rgba(accent, 0.08) },
          },
        },
        defaultProps: { disableElevation: true },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: tokens.radius.sm },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: {
            boxShadow: tokens.shadow.medium,
            '&:hover': { boxShadow: tokens.shadow.strong },
          },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small' },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: tokens.radius.sm,
              '& fieldset': { borderColor: rgba(fg, 0.16) },
              '&:hover fieldset': { borderColor: rgba(fg, 0.3) },
              '&.Mui-focused fieldset': { borderColor: accent },
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: { root: { borderRadius: tokens.radius.sm } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.sm,
            '& fieldset': { borderColor: rgba(fg, 0.16) },
            '&:hover fieldset': { borderColor: rgba(fg, 0.3) },
            '&.Mui-focused fieldset': { borderColor: accent },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: palette.background.paper,
            border: `1px solid ${palette.divider}`,
            borderRadius: tokens.radius.md,
          },
        },
        defaultProps: { elevation: 0 },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: tokens.radius.xs, fontWeight: 600 },
          sizeSmall: { height: 22, fontSize: '0.6875rem', letterSpacing: '0.02em' },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.sm,
            '&:hover': { backgroundColor: palette.action.hover },
            '&.Mui-selected': {
              backgroundColor: rgba(accent, 0.14),
              color: palette.primary.main,
              '&:hover': { backgroundColor: rgba(accent, 0.2) },
            },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            '&.Mui-selected': { color: accent, fontWeight: 600 },
          },
        },
      },
      MuiTabs: {
        styleOverrides: { indicator: { backgroundColor: accent } },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8125rem',
            borderRadius: tokens.radius.sm,
          },
        },
      },
      MuiBreadcrumbs: {
        styleOverrides: { separator: { color: rgba(fg, 0.3) } },
      },
      MuiLink: {
        styleOverrides: {
          root: {
            color: palette.info.main,
            textDecorationColor: 'transparent',
            '&:hover': { textDecorationColor: palette.info.main },
          },
        },
      },
      MuiCircularProgress: {
        defaultProps: { color: 'primary' },
      },
      MuiSkeleton: {
        styleOverrides: {
          root: { backgroundColor: palette.action.hover },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: tokens.radius.sm, alignItems: 'center' },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            border: `1px solid ${palette.divider}`,
            borderRadius: tokens.radius.xs,
            boxShadow: tokens.shadow.soft,
            fontSize: '0.75rem',
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            border: `1px solid ${palette.divider}`,
            borderRadius: tokens.radius.md,
            boxShadow: tokens.shadow.medium,
          },
        },
      },
      MuiDialogContentText: {
        styleOverrides: {
          root: { color: palette.text.secondary },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.xs,
            '&.Mui-selected': {
              backgroundColor: rgba(accent, 0.14),
              '&:hover': { backgroundColor: rgba(accent, 0.2) },
            },
          },
        },
      },
    },
  };
}
