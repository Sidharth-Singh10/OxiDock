import type { ThemeOptions } from '@mui/material/styles';

// Tokyo Night palette
// https://github.com/enkia/tokyo-night-vscode-theme
const tn = {
  // Foreground
  fg:          '#a9b1d6',
  fgDark:      '#787c99',
  fgGutter:    '#3b4261',

  // Background
  bg:          '#1a1b26',
  bgDark:      '#16161e',
  bgHighlight: '#292e42',
  bgFloat:     '#1f2335',

  // Terminal / accent colors
  red:         '#f7768e',
  orange:      '#ff9e64',
  yellow:      '#e0af68',
  green:       '#9ece6a',
  teal:        '#73daca',
  cyan:        '#7dcfff',
  blue:        '#7aa2f7',
  magenta:     '#bb9af7',
  purple:      '#9d7cd8',

  // UI elements
  border:      '#29293b',
  selection:   '#33467c',
  comment:     '#565f89',
  dark3:       '#3b4261',
  dark5:       '#545c7e',
  terminal:    '#414868',
};

export const tokyoNight: ThemeOptions = {
  palette: {
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
      contrastText: tn.bgDark,
    },
    warning: {
      main: tn.yellow,
      light: tn.orange,
      contrastText: tn.bgDark,
    },
    success: {
      main: tn.green,
      light: tn.teal,
      contrastText: tn.bgDark,
    },
    info: {
      main: tn.cyan,
      light: tn.blue,
      contrastText: tn.bgDark,
    },
    background: {
      default: tn.bg,
      paper: tn.bgFloat,
    },
    text: {
      primary: tn.fg,
      secondary: tn.dark5,
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
          backgroundColor: tn.bg,
          color: tn.fg,
          scrollbarColor: `${tn.terminal} ${tn.bgDark}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderColor: tn.border,
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
          backgroundColor: tn.blue,
          color: tn.bgDark,
          '&:hover': {
            backgroundColor: tn.cyan,
          },
        },
        outlinedPrimary: {
          borderColor: tn.blue,
          color: tn.blue,
          '&:hover': {
            borderColor: tn.cyan,
            backgroundColor: `${tn.blue}1a`,
          },
        },
        textPrimary: {
          color: tn.blue,
          '&:hover': {
            backgroundColor: `${tn.blue}1a`,
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
              borderColor: tn.dark3,
            },
            '&:hover fieldset': {
              borderColor: tn.comment,
            },
            '&.Mui-focused fieldset': {
              borderColor: tn.blue,
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
            borderColor: tn.dark3,
          },
          '&:hover fieldset': {
            borderColor: tn.comment,
          },
          '&.Mui-focused fieldset': {
            borderColor: tn.blue,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${tn.border}`,
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
          backgroundColor: tn.bg,
          border: `1px solid ${tn.border}`,
          borderRadius: 16,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          '&:hover': {
            backgroundColor: tn.bgHighlight,
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
            color: tn.blue,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: tn.blue,
        },
      },
    },
    MuiBreadcrumbs: {
      styleOverrides: {
        separator: {
          color: tn.comment,
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: tn.cyan,
          textDecorationColor: 'transparent',
          '&:hover': {
            textDecorationColor: tn.cyan,
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
          backgroundColor: tn.bgDark,
          color: tn.fg,
          border: `1px solid ${tn.border}`,
        },
      },
    },
  },
};
