import { useEffect } from 'react';

/** Registers the installable service worker in production only. */
export function PwaRegister() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
