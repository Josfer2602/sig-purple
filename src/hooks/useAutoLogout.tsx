import { useEffect, useRef } from 'react';
import { useGlobalContext } from '../context/GlobalContext';

// 60 minutes in milliseconds
const TIMEOUT_MS = 60 * 60 * 1000;

export const useAutoLogout = () => {
  const { token, logout } = useGlobalContext();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      logout();
      alert('Tu sesión ha expirado por inactividad prolongada (60 minutos). Por favor, inicia sesión nuevamente.');
    }, TIMEOUT_MS);
  };

  useEffect(() => {
    if (!token) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
    const handleActivity = () => resetTimer();

    // Initialize timer
    resetTimer();

    events.forEach(event => window.addEventListener(event, handleActivity));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  }, [token]);
};
