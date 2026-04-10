// SSE singleton — uma conexão só para toda a app
let _es = null;
let _reconectando = false; // ← flag para evitar reconexões simultâneas
const _listeners = new Map();

function getSSE() {
    if (_es && _es.readyState !== EventSource.CLOSED) return _es;

    // fecha o anterior se ainda existir
    if (_es) { _es.close(); _es = null; }

    _es = new EventSource(API + '/api/status-stream');

    _es.addEventListener('update', (e) => {
        try {
            const { recurso } = JSON.parse(e.data);
            const cbs = _listeners.get(recurso);
            if (cbs) cbs.forEach(cb => cb());
        } catch(_) {}
    });

    _es.onerror = () => {
        if (_reconectando) return; // ← ignora erros duplicados
        _reconectando = true;
        _es?.close();
        _es = null;
        setTimeout(() => {
            _reconectando = false;
            getSSE();
        }, 5000);
    };

    return _es;
}