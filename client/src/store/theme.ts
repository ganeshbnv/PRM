import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (t) => {
        set({ theme: t });
        document.documentElement.classList.toggle('dark', t === 'dark');
      },
      toggle: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        get().setTheme(next);
      },
    }),
    { name: 'prm-theme' }
  )
);

export function applyStoredTheme() {
  try {
    const raw = localStorage.getItem('prm-theme');
    if (raw) {
      const { state } = JSON.parse(raw);
      document.documentElement.classList.toggle('dark', state?.theme === 'dark');
    }
  } catch {}
}
