import { useState, useEffect, useCallback } from "react";

const BASE = (import.meta as any).env.BASE_URL as string;
const API = BASE.replace(/\/$/, "") + "/api";
// SW is in /public, served at the root of the origin (independent of Vite base path)
const SW_PATH = "/sw.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type PushState = "unsupported" | "loading" | "denied" | "subscribed" | "unsubscribed";

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);

  const checkState = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setState("unsubscribed");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "unsubscribed");
    } catch {
      setState("unsubscribed");
    }
  }, []);

  useEffect(() => {
    checkState();
  }, [checkState]);

  const subscribe = useCallback(async () => {
    setError(null);
    try {
      // 1. Fetch VAPID public key
      const keyRes = await fetch(`${API}/push/vapid-public-key`, { credentials: "include" });
      if (!keyRes.ok) throw new Error("Server nicht bereit (VAPID)");
      const { publicKey } = await keyRes.json();

      // 2. Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      // 3. Register SW if not already registered
      let reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      if (!reg) {
        reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
      }
      // Wait for SW to become active
      await navigator.serviceWorker.ready;

      // 4. Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 5. Send subscription to server
      const subJson = sub.toJSON();
      const res = await fetch(`${API}/push/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      if (!res.ok) throw new Error("Fehler beim Speichern des Abonnements");
      setState("subscribed");
    } catch (e: any) {
      setError(e.message ?? "Unbekannter Fehler");
      await checkState();
    }
  }, [checkState]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch(`${API}/push/subscribe`, {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }
      setState("unsubscribed");
    } catch (e: any) {
      setError(e.message ?? "Fehler beim Deaktivieren");
    }
  }, []);

  return { state, error, subscribe, unsubscribe };
}
