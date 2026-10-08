import { useState, useEffect, useCallback } from "react";

const BASE = (import.meta as any).env.BASE_URL as string;
const API = BASE.replace(/\/$/, "") + "/api";
const SW_PATH = `${BASE}sw.js`;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
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
    // Nur Browser-Support prüfen — Server-Check gehört in subscribe(), nicht hier.
    // So bleibt der Button sichtbar, auch wenn VAPID noch nicht konfiguriert ist.
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
      // Server-Support prüfen (VAPID konfiguriert?)
      const keyRes = await fetch(`${API}/push/vapid-public-key`, {
        credentials: "include",
        signal: AbortSignal.timeout(8000),
      });
      if (!keyRes.ok) throw new Error("Server nicht erreichbar");
      const keyData = await keyRes.json();
      if (!keyData.supported || !keyData.publicKey) {
        throw new Error("Push-Benachrichtigungen sind auf dem Server noch nicht konfiguriert (VAPID-Keys fehlen).");
      }

      // Erlaubnis anfragen
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      // SW registrieren falls noch nicht vorhanden
      let reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      if (!reg) {
        reg = await navigator.serviceWorker.register(SW_PATH, { scope: BASE, updateViaCache: "none" });
      }
      await navigator.serviceWorker.ready;

      // Push-Abonnement anlegen
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });

      // An Server senden
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
