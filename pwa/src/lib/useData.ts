import { useState, useEffect, useCallback } from 'react';
import { api, type StateResponse, type SnapshotRow } from './api';

export function useAppState(intervalMs = 15_000) {
  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.state();
      setData(d);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, error, refresh };
}

export function useHistory(book: string, range = '24h') {
  const [history, setHistory] = useState<SnapshotRow[]>([]);

  useEffect(() => {
    api.history(book, range).then(setHistory).catch(console.error);
  }, [book, range]);

  return history;
}
