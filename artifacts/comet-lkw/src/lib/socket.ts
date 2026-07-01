import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(window.location.origin, {
      path: "/api/socket.io",
      // WebSocket-first: verhindert Probleme mit dem Polling→WebSocket-Upgrade
      // im PWA-Standalone-Modus. WebSocket-Verbindungen werden nie gecacht
      // und funktionieren zuverlässig in installierten PWAs.
      transports: ["websocket", "polling"],
      upgrade: false,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
  }
  return socket;
};
