import type { ThemeOptions } from '@mui/material/styles';

// Catppuccin Mocha palette
// https://github.com/catppuccin/catppuccin
const mocha = {
  rosewater: '#f5e0dc',
  flamingo:  '#f2cdcd',
  pink:      '#f5c2e7',
  mauve:     '#cba6f7',
  red:       '#f38ba8',
  maroon:    '#eba0ac',
  peach:     '#fab387',
  yellow:    '#f9e2af',
  green:     '#a6e3a1',
  teal:      '#94e2d5',
  sky:       '#89dceb',
  sapphire:  '#74c7ec',
  blue:      '#89b4fa',
  lavender:  '#b4befe',
  text:      '#cdd6f4',
  subtext1:  '#bac2de',
  subtext0:  '#a6adc8',
  overlay2:  '#9399b2',
  overlay1:  '#7f849c',
  overlay0:  '#6c7086',
  surface2:  '#585b70',
  surface1:  '#45475a',
  surface0:  '#313244',
  base:      '#1e1e2e',
  mantle:    '#181825',
  crust:     '#11111b',
};

export const catppuccinMocha: ThemeOptions = {
  palette: {
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
      contrastText: mocha.crust,
    },
    warning: {
      main: mocha.yellow,
      light: mocha.peach,
      contrastText: mocha.crust,
    },
    success: {
      main: mocha.green,
      light: mocha.teal,
      contrastText: mocha.crust,
    },
    info: {
      main: mocha.sapphire,
      light: mocha.sky,
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
  },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: mocha.base,
          color: mocha.text,
          scrollbarColor: `${mocha.surface2} ${mocha.mantle}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderColor: mocha.surface1,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
        },
        containedPrimary: {
          backgroundColor: mocha.mauve,
          color: mocha.crust,
          '&:hover': {
            backgroundColor: mocha.lavender,
          },
        },
        outlinedPrimary: {
          borderColor: mocha.mauve,
          color: mocha.mauve,
          '&:hover': {
            borderColor: mocha.lavender,
            backgroundColor: `${mocha.mauve}1a`,
          },
        },
        textPrimary: {
          color: mocha.mauve,
          '&:hover': {
            backgroundColor: `${mocha.mauve}1a`,
          },
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            '& fieldset': {
              borderColor: mocha.surface2,
            },
            '&:hover fieldset': {
              borderColor: mocha.overlay0,
            },
            '&.Mui-focused fieldset': {
              borderColor: mocha.mauve,
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          '& fieldset': {
            borderColor: mocha.surface2,
          },
          '&:hover fieldset': {
            borderColor: mocha.overlay0,
          },
          '&.Mui-focused fieldset': {
            borderColor: mocha.mauve,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${mocha.surface1}`,
          borderRadius: 14,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: mocha.base,
          border: `1px solid ${mocha.surface1}`,
          borderRadius: 16,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          '&:hover': {
            backgroundColor: mocha.surface0,
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          '&.Mui-selected': {
            color: mocha.mauve,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: mocha.mauve,
        },
      },
    },
    MuiBreadcrumbs: {
      styleOverrides: {
        separator: {
          color: mocha.overlay0,
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: mocha.sapphire,
          textDecorationColor: 'transparent',
          '&:hover': {
            textDecorationColor: mocha.sapphire,
          },
        },
      },
    },
    MuiCircularProgress: {
      defaultProps: {
        color: 'primary',
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: mocha.mantle,
          color: mocha.text,
          border: `1px solid ${mocha.surface1}`,
        },
      },
    },
  },
};
