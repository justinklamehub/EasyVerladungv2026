import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getSocket } from "@/lib/socket";

export interface OnlineUser {
  userId: number;
  username: string;
  role: string;
  speditionId: number | undefined;
  page: string;
  connectedAt: string;
}

export const PAGE_NAMES: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/shipments": "Verladungen",
  "/wochenansicht": "Wochenplan",
  "/torbelegung": "Tor-Belegungsplan",
  "/speditionen": "Speditionen",
  "/users": "Benutzer",
  "/paletten": "Palettenkonto",
  "/abstimmungen": "Abstimmungen",
  "/gefahrgut": "Gefahrgut",
  "/auswertung": "Auswertung",
  "/auditlog": "Änderungslog",
  "/speditionsfreigabe": "Speditionsfreigabe",
  "/settings": "Einstellungen",
  "/berechtigungen": "Berechtigungen",
  "/profil": "Mein Profil",
  "/scanner": "Scanner",
};

export function getPageName(path: string): string {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  for (const [key, name] of Object.entries(PAGE_NAMES)) {
    if (key !== "/" && path.startsWith(key + "/")) return name;
  }
  return path || "Unbekannte Seite";
}

export const ROLE_LABELS: Record<string, string> = {
  comet_admin: "Admin",
  comet_leitstand: "Leitstand",
  comet_lager: "Lager",
  comet_viewer: "Betrachter",
  speditions_admin: "Sped. Admin",
  speditions_viewer: "Sped. Betrachter",
};

export function usePresence(currentUserId?: number) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [location] = useLocation();

  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = (users: OnlineUser[]) => {
      setOnlineUsers(users);
    };
    socket.on("presence.update", handleUpdate);
    return () => {
      socket.off("presence.update", handleUpdate);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("presence.page", { page: location });
  }, [location]);

  const others = onlineUsers.filter((u) => u.userId !== currentUserId);
  const onPage = (path: string) =>
    others.filter(
      (u) =>
        u.page === path ||
        (path !== "/" && u.page.startsWith(path + "/"))
    );

  return { onlineUsers, others, onPage };
}
