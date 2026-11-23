import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { validVisuals } from '../public/game/combat-visuals.js';

const directions = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const skins = ['lina', 'noe', 'hunter', 'rogue', 'warlock'];
const finite = n => typeof n === 'number' && Number.isFinite(n);

export function readTicket(token, secret, now = Date.now()) {
    if (typeof token !== 'string' || token.length > 2048) throw new Error('Ticket invalide');
    const parts = token.split('.');
    if (parts.length !== 2) throw new Error('Ticket invalide');
    const signature = createHmac('sha256', secret).update(parts[0]).digest('base64url');
    if (parts[1].length !== signature.length || !timingSafeEqual(Buffer.from(parts[1]), Buffer.from(signature))) throw new Error('Signature invalide');
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!Number.isSafeInteger(p.id) || p.id < 1 || typeof p.name !== 'string' || p.name.length > 80
        || !skins.includes(p.skin) || !Number.isSafeInteger(p.level) || p.level < 1 || p.level > 9999
        || typeof p.lease !== 'string' || !/^[a-f0-9-]{36}$/.test(p.lease)
        || !Number.isInteger(p.exp) || p.exp * 1000 <= now || p.exp * 1000 > now + 60000) throw new Error('Ticket expiré ou invalide');
    return p;
}

export function publicState(s, profile, now) {
    if(s?.staff!==undefined&&typeof s.staff!=='boolean')throw new Error('Arme invalide');
    if (!s || !finite(s.x) || !finite(s.y) || s.x < 0 || s.x >= 4096 || s.y < 0 || s.y >= 4032
        || !directions.includes(s.facing) || typeof s.walking !== 'boolean' || typeof s.alive !== 'boolean'
        || !Number.isInteger(s.attackFrame) || s.attackFrame < -1 || s.attackFrame > 8 || typeof s.ranged !== 'boolean'
        || !Array.isArray(s.actions) || s.actions.length > 6 || !validVisuals(s.visuals)) throw new Error('État invalide');
    const time = finite(s.sampleTime) ? Math.max(now - 1000, Math.min(now, s.sampleTime)) : now;
    const actions = s.actions.map(a => {
        if (!Array.isArray(a) || a.length !== 6 || typeof a[0] !== 'string' || !/^[a-f0-9-]{36}$/.test(a[0]) || a[0] === profile.lease
            || ![a[1], a[2], a[3], a[5]].every(Number.isInteger) || a[1] < 0 || a[1] > 6000
            || a[2] < 1 || a[2] > 5000 || a[3] < 0 || a[3] > a[2] + 210 || typeof a[4] !== 'boolean'
            || a[5] < 0 || a[5] > 7) throw new Error('Animation invalide');
        return [a[0], time - a[1], ...a.slice(2)];
    });
    return { id: profile.id, name: profile.name, skin: profile.skin, level: profile.level,
        x: s.x, y: s.y, facing: s.facing, walking: s.walking, alive: s.alive, attackFrame: s.attackFrame,
        ranged: s.ranged, staff:Boolean(s.staff), actions, updatedAt: time, visuals: s.visuals };
}

export function createPresenceServer({ secret, port = 8081, host = '127.0.0.1' }) {
    if (!secret) throw new Error('APP_SECRET requis');
    const server = createServer((req, res) => { res.writeHead(req.url === '/health' ? 200 : 404); res.end('presence'); });
    const wss = new WebSocketServer({ noServer: true, maxPayload: 131072, perMessageDeflate: false });
    const clients = new Map();
    server.on('upgrade', (req, socket, head) => {
        let sameOrigin = false;
        try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
        if (!sameOrigin || req.url !== '/monde-socket' || wss.clients.size >= 200) { socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
    });
    wss.on('connection', ws => {
        let profile, state, receivedAt = Date.now(), windowAt = receivedAt, messages = 0;
        const authTimeout = setTimeout(() => { if (!profile) ws.close(4001, 'Authentification requise'); }, 5000);
        ws.on('error', () => {});
        ws.on('close', () => { clearTimeout(authTimeout); if (clients.get(profile?.id)?.ws === ws) clients.delete(profile.id); });
        ws.on('message', (bytes, binary) => {
            try {
                const now = Date.now();
                if (now - windowAt > 1000) { messages = 0; windowAt = now; }
                if (binary || ++messages > 40) throw new Error('Cadence invalide');
                const data = JSON.parse(bytes.toString());
                if (data.type === 'auth') {
                    const next = readTicket(data.token, secret, now);
                    if (profile && next.id !== profile.id) throw new Error('Personnage invalide');
                    if (clients.has(next.id) && clients.get(next.id).ws !== ws) { ws.close(4009, 'Personnage déjà connecté'); return; }
                    profile = next;
                    clearTimeout(authTimeout);
                    clients.set(profile.id, { ws, get state() { return state; }, get receivedAt() { return receivedAt; }, get expiry() { return profile.exp * 1000; } });
                    ws.send(JSON.stringify({ type: 'ready', echo: data.at, serverTime: now }));
                } else if (data.type === 'state' && profile && profile.exp * 1000 > now) {
                    state = publicState(data.state, profile, now);
                    receivedAt = now;
                } else throw new Error('Message invalide');
            } catch { ws.close(4003, 'Message refusé'); }
        });
    });
    // shortcut: relais unique en mémoire ; répartir les zones avant plusieurs centaines de joueurs actifs.
    const timer = setInterval(() => {
        const now = Date.now();
        const active = [...clients.values()].filter(c => {
            if (c.expiry <= now || now - c.receivedAt > 12000 || c.ws.bufferedAmount > 1048576) { c.ws.terminate(); return false; }
            return Boolean(c.state);
        });
        for (const client of active) {
            const players = active.filter(other => other !== client && Math.hypot(other.state.x - client.state.x, other.state.y - client.state.y) <= 800)
                .slice(0, 100).map(c => c.state);
            if (client.ws.readyState === 1) client.ws.send(JSON.stringify({ type: 'snapshot', players, onlineCount: active.length, serverTime: now }));
        }
    }, 50);
    server.on('close', () => clearInterval(timer));
    server.listen(port, host);
    return { server, wss, close: () => { clearInterval(timer); for (const ws of wss.clients) ws.terminate(); return new Promise(resolve => wss.close(() => server.close(resolve))); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const relay = createPresenceServer({ secret: process.env.APP_SECRET });
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await relay.close(); process.exit(0); });
}
