import { useAuthStore } from '../store/auth';

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, register, logout } = useAuthStore();
  return { user, isAuthenticated, isLoading, login, register, logout };
}
