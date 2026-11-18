// Dynamic API and Base URL resolution
// Handles standalone Vite dev (port 5173 -> 5000), AppLauncher dynamic ports (e.g. 54957 -> 54956),
// custom VITE_API_URL environment variables, and same-origin production builds.

export const getApiUrl = (): string => {
  // 1. In browser, detect port and hostname dynamically
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port ? Number(window.location.port) : 80;
    const isRemote = hostname !== 'localhost' && hostname !== '127.0.0.1';

    // 1. Check Vite env variable first (if configured, e.g. for Vercel pointing to external backend)
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && envUrl !== 'undefined' && envUrl.trim() !== '') {
      let finalUrl = envUrl.trim();
      // If browsing from a mobile/network IP (e.g. 192.168.18.8) and env has localhost, replace it with current hostname
      if (isRemote && (finalUrl.includes('localhost') || finalUrl.includes('127.0.0.1'))) {
        finalUrl = finalUrl.replace('localhost', hostname).replace('127.0.0.1', hostname);
      }
      return finalUrl;
    }

    // In production builds or standard web ports without custom VITE_API_URL, use same-origin relative '/api'
    if (import.meta.env.PROD || port === 80 || port === 443) {
      return '/api';
    }

    // Standard standalone Vite dev server (frontend 5173 -> backend 5000)
    if (port === 5173) {
      return `${protocol}//${hostname}:5000/api`;
    }

    // Dynamic paired ports allocated by AppLauncher / dev runners (frontend is backend + 1)
    if (port > 1024) {
      return `${protocol}//${hostname}:${port - 1}/api`;
    }

    // Default same-origin production API
    return '/api';
  }

  return 'http://localhost:5000/api';
};

export const getBaseServerUrl = (): string => {
  return getApiUrl().replace(/\/api\/?$/, '');
};

export const API_URL = getApiUrl();
export const BASE_URL = getBaseServerUrl();
