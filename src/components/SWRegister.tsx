"use client";

import { useEffect } from "react";

/** Registers the service worker (production only — dev caching causes confusion). */
export default function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW registration failed:", err));
  }, []);
  return null;
}
