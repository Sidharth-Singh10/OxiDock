import type { ThemeOptions } from '@mui/material/styles';
import { buildTheme } from './buildTheme';
import type { AppPalette } from './buildTheme';

// Tokyo Night palette
// https://github.com/enkia/tokyo-night-vscode-theme
const tn = {
  // Foreground
  fg: '#a9b1d6',
  fgDark: '#787c99',
  fgGutter: '#3b4261',

  // Background
  bg: '#1a1b26',
  bgDark: '#16161e',
  bgHighlight: '#292e42',
  bgFloat: '#1f2335',

  // Terminal / accent colors
  red: '#f7768e',
  orange: '#ff9e64',
  yellow: '#e0af68',
  green: '#9ece6a',
  teal: '#73daca',
  cyan: '#7dcfff',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  purple: '#9d7cd8',

  // UI elements
  border: '#29293b',
  selection: '#33467c',
  comment: '#565f89',
  dark3: '#3b4261',
  dark5: '#545c7e',
  terminal: '#414868',
};

const palette: AppPalette = {
  mode: 'dark',
  primary: {
    main: tn.blue,
    light: tn.cyan,
    dark: tn.purple,
    contrastText: tn.bgDark,
  },
  secondary: {
    main: tn.magenta,
    light: tn.purple,
    dark: tn.magenta,
    contrastText: tn.bgDark,
  },
  error: {
    main: tn.red,
    light: tn.orange,
    dark: tn.red,
    contrastText: tn.bgDark,
  },
  warning: {
    main: tn.yellow,
    light: tn.orange,
    dark: tn.yellow,
    contrastText: tn.bgDark,
  },
  success: {
    main: tn.green,
    light: tn.teal,
    dark: tn.teal,
    contrastText: tn.bgDark,
  },
  info: {
    main: tn.cyan,
    light: tn.blue,
    dark: tn.blue,
    contrastText: tn.bgDark,
  },
  background: {
    default: tn.bg,
    paper: tn.bgFloat,
  },
  text: {
    primary: tn.fg,
    secondary: '#9aa5ce',
    disabled: tn.fgGutter,
  },
  divider: tn.border,
  action: {
    hover: `${tn.bgHighlight}aa`,
    selected: `${tn.selection}cc`,
    disabled: tn.fgGutter,
    disabledBackground: tn.bgFloat,
    focus: `${tn.blue}33`,
  },
};

export const tokyoNight: ThemeOptions = buildTheme(palette, {
  glassBase: tn.bgHighlight,
  scrimBase: '#101018',
  glowPrimary: tn.blue,
  glowSecondary: tn.cyan,
});
