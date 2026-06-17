import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
    }),
    { name: 'prm-theme' }
  )
);

export function applyStoredTheme() {
  const stored = localStorage.getItem('prm-theme');
  if (stored) {
    try {
      const { state } = JSON.parse(stored) as { state?: { theme?: Theme } };
      if (state?.theme) document.documentElement.setAttribute('data-theme', state.theme);
    } catch { /* ignore */ }
  }
}
