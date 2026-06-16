import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { Spinner } from '../common/Spinner';
import { SearchModal } from '../search/SearchModal';
import { NotificationPanel } from '../notifications/NotificationPanel';
import { useUIStore } from '../../store/ui';

export function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { searchOpen, setSearchOpen } = useUIStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-white">
          <Outlet />
        </main>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NotificationPanel />
    </div>
  );
}
