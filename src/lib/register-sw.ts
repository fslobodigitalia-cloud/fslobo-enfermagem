import { Workbox } from "workbox-window";

type UpdateCallback = (reload: () => void) => void;

// Guarded service worker registration. Registers only in the published app,
// never in Lovable preview/dev/iframe. Supports ?sw=off kill switch.
export function registerServiceWorker(onUpdate?: UpdateCallback) {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const host = window.location.hostname;
  const inIframe = window.self !== window.top;
  const isPreviewHost =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");
  const killSwitch = url.searchParams.get("sw") === "off";
  const refused = !import.meta.env.PROD || inIframe || isPreviewHost || killSwitch;

  if (refused) {
    navigator.serviceWorker.getRegistrations?.().then((regs) => {
      regs.forEach((r) => {
        if (r.active?.scriptURL.endsWith("/sw.js")) r.unregister();
      });
    });
    return;
  }

  window.addEventListener("load", () => {
    const wb = new Workbox("/sw.js");
    const reload = () => {
      wb.addEventListener("controlling", () => window.location.reload());
      wb.messageSkipWaiting();
    };
    wb.addEventListener("waiting", () => onUpdate?.(reload));
    wb.register().catch((err) => console.warn("SW registration failed", err));
    setInterval(() => wb.update().catch(() => {}), 60 * 60 * 1000);
  });
}