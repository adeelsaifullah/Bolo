"use client";

import { useEffect } from "react";

/** Registers /sw.js in production only. Renders nothing. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // The app works without a service worker; nothing to tell the user.
    });
  }, []);
  return null;
}
