import { createContext, useContext, useMemo, useState } from 'react';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import { themes, defaultThemeName } from './index';
import type { ThemeDefinition } from './index';

interface ThemeContextValue {
  themeName: string;
  setThemeName: (name: string) => void;
  availableThemes: { key: string; label: string; group?: string; variant?: string }[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState(() => {
    try {
      return localStorage.getItem('oxidock-theme') || defaultThemeName;
    } catch {
      return defaultThemeName;
    }
  });

  const handleSetTheme = (name: string) => {
    setThemeName(name);
    try {
      localStorage.setItem('oxidock-theme', name);
    } catch { /* ignore */ }
  };

  const theme = useMemo(() => {
    const def = themes[themeName] ?? themes[defaultThemeName];
    return createTheme(def.options);
  }, [themeName]);

  const availableThemes = useMemo(
    () => Object.entries(themes).map(([key, def]: [string, ThemeDefinition]) => ({
      key,
      label: def.label,
      group: def.group,
      variant: def.variant,
    })),
    [],
  );

  const value = useMemo(
    () => ({ themeName, setThemeName: handleSetTheme, availableThemes }),
    [themeName, availableThemes],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}
