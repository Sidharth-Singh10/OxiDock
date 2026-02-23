import type { ThemeOptions } from '@mui/material/styles';
import { catppuccinMocha } from './catppuccin';
import { tokyoNight } from './tokyonight';

export interface ThemeDefinition {
  label: string;
  group?: string;        // e.g. "Catppuccin" — for grouping variants
  variant?: string;      // e.g. "Mocha"
  options: ThemeOptions;
}

export const themes: Record<string, ThemeDefinition> = {
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    group: 'Catppuccin',
    variant: 'Mocha',
    options: catppuccinMocha,
  },
  'tokyonight': {
    label: 'Tokyo Night',
    options: tokyoNight,
  },
};

export const defaultThemeName = 'catppuccin-mocha';
