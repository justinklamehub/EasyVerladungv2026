import { createRoot } from "react-dom/client";
import { startAppUpdates } from "./lib/app-updates";
import "./index.css";

declare const __APP_BUILD_ID__: string;

async function boot() {
  if (await startAppUpdates(__APP_BUILD_ID__, import.meta.env.BASE_URL)) return;
  const { default: App } = await import("./App");
  createRoot(document.getElementById("root")!).render(<App />);
}
void boot().catch((err) => {
  console.error("App konnte nicht gestartet werden.", err);
  const root = document.getElementById("root")!;
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = "Die App konnte nicht geladen werden. Bitte die Verbindung prüfen.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Erneut laden";
  retry.onclick = () => location.reload();
  root.replaceChildren(message, retry);
});
