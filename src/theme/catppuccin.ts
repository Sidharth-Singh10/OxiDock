import type { ThemeOptions } from '@mui/material/styles';
import { buildTheme } from './buildTheme';
import type { AppPalette } from './buildTheme';

// Catppuccin Mocha palette
// https://github.com/catppuccin/catppuccin
const mocha = {
  rosewater: '#f5e0dc',
  flamingo: '#f2cdcd',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  maroon: '#eba0ac',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  sapphire: '#74c7ec',
  blue: '#89b4fa',
  lavender: '#b4befe',
  text: '#cdd6f4',
  subtext1: '#bac2de',
  overlay0: '#6c7086',
  surface1: '#45475a',
  surface0: '#313244',
  base: '#1e1e2e',
  crust: '#11111b',
};

const palette: AppPalette = {
  mode: 'dark',
  primary: {
    main: mocha.mauve,
    light: mocha.lavender,
    dark: mocha.blue,
    contrastText: mocha.crust,
  },
  secondary: {
    main: mocha.pink,
    light: mocha.rosewater,
    dark: mocha.flamingo,
    contrastText: mocha.crust,
  },
  error: {
    main: mocha.red,
    light: mocha.maroon,
    dark: mocha.red,
    contrastText: mocha.crust,
  },
  warning: {
    main: mocha.yellow,
    light: mocha.peach,
    dark: mocha.yellow,
    contrastText: mocha.crust,
  },
  success: {
    main: mocha.green,
    light: mocha.teal,
    dark: mocha.teal,
    contrastText: mocha.crust,
  },
  info: {
    main: mocha.sapphire,
    light: mocha.sky,
    dark: mocha.blue,
    contrastText: mocha.crust,
  },
  background: {
    default: mocha.base,
    paper: mocha.surface0,
  },
  text: {
    primary: mocha.text,
    secondary: mocha.subtext1,
    disabled: mocha.overlay0,
  },
  divider: mocha.surface1,
  action: {
    hover: `${mocha.surface1}80`,
    selected: `${mocha.surface1}cc`,
    disabled: mocha.overlay0,
    disabledBackground: mocha.surface0,
    focus: `${mocha.mauve}33`,
  },
};

export const catppuccinMocha: ThemeOptions = buildTheme(palette, {
  glassBase: mocha.surface0,
  scrimBase: mocha.crust,
  glowPrimary: mocha.mauve,
  glowSecondary: mocha.blue,
});
