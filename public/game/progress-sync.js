import { xpRequired, xpVersion } from './balance.js';
export function createProgressSync(url, token, onStatus) {
    let pending = null;
    let saved = null;
    const requests = new Map();

    const flush = () => {
        if (!pending) return Promise.resolve(true);
        const snapshot = pending;
        if (requests.has(snapshot)) return requests.get(snapshot);
        onStatus('saving');
        const request = Promise.resolve().then(async () => {
            try {
                const response = await fetch(url, {
                    method: 'POST', credentials: 'same-origin', keepalive: true,
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: snapshot,
                });
                if (!response.ok) throw new Error('Save failed');
                const result = await response.json();
                const sent = JSON.parse(snapshot);
                if (!Number.isSafeInteger(result.level) || result.level < sent.level || result.level > 9999
                    || !Number.isSafeInteger(result.xp) || result.xp < 0 || result.xp >= xpRequired(result.level)
                    || (result.level === sent.level && result.xp < sent.xp)) throw new Error('Invalid response');
                if (pending === snapshot) { saved = snapshot; pending = null; onStatus('saved'); }
                return true;
            } catch {
                if (pending === snapshot) onStatus('error');
                return false;
            } finally {
                requests.delete(snapshot);
            }
        });
        requests.set(snapshot, request);
        return request;
    };

    return {
        save(progress) {
            const snapshot = JSON.stringify({ level: progress.level, xp: progress.xp, xpVersion, _token: token });
            if (snapshot === saved && !pending) return;
            pending = snapshot;
            void flush();
        },
        flush,
    };
}
