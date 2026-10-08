import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../services/api';
import { formatAlgeriaDateTime } from '../../utils/formatters';

interface Notification {
  id: number;
  message: string;
  type: 'info' | 'delegation' | 'evaluation' | 'warning' | 'success';
  read: number;
  createdAt: string;
  link?: string;
}

const typeIcons: Record<string, string> = {
  delegation: '🔄',
  evaluation: '📋',
  warning:    '⚠️',
  info:       'ℹ️',
};

export const NotificationBell: React.FC = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    if (!user?.username || !token || user.mustChangePassword) return;
    fetch(`${API_BASE_URL}/api/notifications/${user.username}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.notifications) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        }
      })
      .catch(() => {});
  };

  // Poll every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user?.username, token]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markAsRead = async (id: number) => {
    await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    if (!user?.username) return;
    await fetch(`${API_BASE_URL}/api/notifications/read-all/${user.username}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifications(); }}
        className="relative p-2.5 text-slate-400 hover:text-primary-600 transition-colors rounded-xl hover:bg-primary-50 border border-transparent hover:border-primary-100"
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-white text-white text-[10px] font-bold flex items-center justify-center px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-14 w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800">Notifications</h3>
              {unreadCount > 0 && <p className="text-xs text-slate-400">{unreadCount} non lue(s)</p>}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} title="Tout marquer comme lu"
                  className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                  <CheckCheck size={16} />
                </button>
              )}
              <button onClick={() => setOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Bell size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Aucune notification</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id}
                  onClick={() => {
                    if (n.link) {
                      if (!n.read) markAsRead(n.id);
                      setOpen(false);
                      navigate(n.link);
                    }
                  }}
                  className={`flex items-start gap-3 px-5 py-4 transition-colors ${n.read ? 'bg-white' : 'bg-blue-50/40'} ${n.link ? 'cursor-pointer hover:bg-indigo-50/60' : ''}`}>
                  <span className="text-xl mt-0.5 flex-shrink-0">{typeIcons[n.type] || 'ℹ️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${n.read ? 'text-slate-500' : 'text-slate-800'}`}>
                      {n.message}
                    </p>
                    {n.link && (
                      <p className="text-xs text-indigo-500 font-semibold mt-0.5">Cliquez pour ouvrir →</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {formatAlgeriaDateTime(n.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!n.read && (
                    <button onClick={e => { e.stopPropagation(); markAsRead(n.id); }} title="Marquer comme lu"
                      className="flex-shrink-0 p-1 text-slate-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors mt-0.5">
                      <Check size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
