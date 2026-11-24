import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';

export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ unread: number }>('/notifications/unread-count');
      setCount(data.unread);
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    const interval = window.setInterval(refresh, 60_000);
    const onRefresh = () => void refresh();
    window.addEventListener('notifications:refresh', onRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('notifications:refresh', onRefresh);
    };
  }, [refresh]);

  return count;
}
