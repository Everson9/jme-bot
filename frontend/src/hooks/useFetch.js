// src/hooks/useFetch.js
import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || "";

export function useFetch(url, intervalo = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch(API + url);
      
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error('Resposta não é JSON');
      }
      
      const json = await r.json();
      setData(json);
      setError(null);
    } catch (e) {
      console.error(`useFetch error (${url}):`, e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    
    if (intervalo) {
      const timer = setInterval(load, intervalo);
      return () => clearInterval(timer);
    }
  }, [load, intervalo]);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch };
}