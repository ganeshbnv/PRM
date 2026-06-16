import { useEffect, useState } from 'react';
import { X, Bell, Check } from 'lucide-react';
import { useUIStore } from '../../store/ui';
import type { Notification, PaginatedResponse } from '../../types';
import { apiClient } from '../../api/client';
import { RelativeTime } from '../common/RelativeTime';
import { Skeleton } from '../common/Skeleton';
import { cn } from '../../utils/cn';

export function NotificationPanel() {
  const { notificationPanelOpen, setNotificationPanelOpen } = useUIStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!notificationPanelOpen) return;
    setLoading(true);
    apiClient.get<PaginatedResponse<Notification>>('/notifications')
      .then((r) => setNotifications(r.data.data))
      .finally(() => setLoading(false));
  }, [notificationPanelOpen]);

  const markAllRead = async () => {
    await apiClient.put('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const markRead = async (id: string) => {
    await apiClient.put(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  };

  if (!notificationPanelOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={() => setNotificationPanelOpen(false)} />
      <div className="relative z-10 w-80 bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Bell size={16} />Notifications
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              <Check size={12} />All read
            </button>
            <button onClick={() => setNotificationPanelOpen(false)} className="p-1 rounded hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No notifications</div>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => markRead(n.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors',
                      !n.isRead && 'bg-brand-50'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.isRead && <div className="w-2 h-2 bg-brand-600 rounded-full flex-shrink-0 mt-1.5" />}
                      <div className={!n.isRead ? '' : 'ml-4'}>
                        <div className="text-sm font-medium text-gray-900">{n.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{n.body}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          <RelativeTime date={n.createdAt} />
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
