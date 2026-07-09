import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: 'light',
  setTheme: (t) => {
    set({ theme: t });
    document.documentElement.classList.toggle('dark', t === 'dark');
  },
  toggle: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },
}));

export function applyStoredTheme() {
  // Always start in light mode on page load
  document.documentElement.classList.remove('dark');
}
