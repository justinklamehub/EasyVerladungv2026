import { useState, useEffect, useCallback } from "react";
import { getSocket } from "@/lib/socket";

export interface AppNotification {
  id: number;
  userId: number;
  title: string;
  message: string | null;
  type: string;
  linkTo: string | null;
  read: boolean;
  createdAt: string;
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/api/notifications");
      setNotifications(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (notif: AppNotification) => {
      setNotifications((prev) => [notif, ...prev]);
    };
    socket.on("notification.new", handler);
    return () => { socket.off("notification.new", handler); };
  }, []);

  const markRead = useCallback(async (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await apiFetch("/api/notifications/read-all", { method: "PATCH" });
  }, []);

  const dismiss = useCallback(async (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await apiFetch(`/api/notifications/${id}`, { method: "DELETE" });
  }, []);

  const dismissAll = useCallback(async () => {
    setNotifications([]);
    await apiFetch("/api/notifications", { method: "DELETE" });
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, loading, unreadCount, markRead, markAllRead, dismiss, dismissAll };
}
