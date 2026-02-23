/// <reference types="vite/client" />

import '@mui/joy/styles';

declare module '@mui/joy/styles' {
  interface ColorSchemeOverrides {
    catppuccin: true;
  }
}
