import type { ThemeOptions } from '@mui/material/styles';
import { catppuccinMocha } from './catppuccin';
import { tokyoNight } from './tokyonight';

export interface ThemeDefinition {
  label: string;
  group?: string;        // e.g. "Catppuccin" — for grouping variants
  variant?: string;      // e.g. "Mocha"
  swatch: string;        // representative accent color for the theme picker
  options: ThemeOptions;
}

export const themes: Record<string, ThemeDefinition> = {
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    group: 'Catppuccin',
    variant: 'Mocha',
    swatch: '#cba6f7',
    options: catppuccinMocha,
  },
  'tokyonight': {
    label: 'Tokyo Night',
    swatch: '#7aa2f7',
    options: tokyoNight,
  },
};

export const defaultThemeName = 'catppuccin-mocha';
