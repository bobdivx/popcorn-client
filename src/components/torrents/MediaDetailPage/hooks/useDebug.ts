import { useState, useCallback } from 'preact/hooks';
import type { DebugLog, DebugLogType } from '../types';

export function useDebug() {
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);

  const addDebugLog = useCallback((type: DebugLogType, message: string, data?: any) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs((prev) => {
      const newLogs = [...prev.slice(-49), { time, type, message, data }];
      console.log(`[DEBUG ${time}] ${type.toUpperCase()}: ${message}`, data || '');
      return newLogs;
    });
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
    addDebugLog('info', '=== Logs effacés ===');
  }, [addDebugLog]);

  return {
    showDebug,
    setShowDebug,
    debugLogs,
    addDebugLog,
    clearDebugLogs,
  };
}
