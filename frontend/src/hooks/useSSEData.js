// src/hooks/useSSEData.js
// Substitui useFetch com polling — só recarrega quando o backend notifica via SSE
// Uso: const { data, loading, refetch } = useSSEData('/api/chamados', 'chamados');
//   - url: rota da API
//   - recurso: nome do evento SSE que dispara recarga (ex: 'chamados', 'clientes', 'carne')

import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};

// SSE singleton — uma conexão só para toda a app
let _es = null;
const _listeners = new Map(); // recurso → Set de callbacks

function getSSE() {
    if (_es && _es.readyState !== EventSource.CLOSED) return _es;
    _es = new EventSource(API + '/api/status-stream');
    _es.addEventListener('update', (e) => {
        try {
            const { recurso } = JSON.parse(e.data);
            const cbs = _listeners.get(recurso);
            if (cbs) cbs.forEach(cb => cb());
        } catch(_) {}
    });
    _es.onerror = () => {
        // Reconecta em 5s
        setTimeout(() => { _es = null; getSSE(); }, 5000);
    };
    return _es;
}

export function useSSEData(url, recurso) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const r = await fetch(API + url, { headers: authHeaders() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const json = await r.json();
            if (mountedRef.current) { setData(json); setError(null); }
        } catch(e) {
            if (mountedRef.current) setError(e.message);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [url]);

    useEffect(() => {
        mountedRef.current = true;
        load(); // carrega ao montar

        // Registra listener SSE para este recurso
        if (recurso) {
            getSSE(); // garante conexão ativa
            if (!_listeners.has(recurso)) _listeners.set(recurso, new Set());
            _listeners.get(recurso).add(load);
        }

        return () => {
            mountedRef.current = false;
            if (recurso) {
                _listeners.get(recurso)?.delete(load);
            }
        };
    }, [load, recurso]);

    return { data, loading, error, refetch: load };
}