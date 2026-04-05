// frontend/src/api/client.js
// Wrapper de fetch que injeta API key automaticamente

const API = import.meta.env.VITE_API_URL || '';

function headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const key = import.meta.env.VITE_ADMIN_API_KEY;
    if (key) h['x-api-key'] = key;
    return h;
}

async function check(resp) {
    if (!resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            const body = await resp.json();
            throw new Error(body.erro || body.error || 'Erro na requisição');
        }
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return resp.json();
}

export const api = {
    get:    (url)        => fetch(API + url).then(check),
    post:   (url, body)  => fetch(API + url, { method: 'POST', headers: headers(), body: JSON.stringify(body || {}) }).then(check),
    put:    (url, body)  => fetch(API + url, { method: 'PUT',  headers: headers(), body: JSON.stringify(body || {}) }).then(check),
    delete: (url)        => fetch(API + url, { method: 'DELETE', headers: headers() }).then(check),
    API,
};
