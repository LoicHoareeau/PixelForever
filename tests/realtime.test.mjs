import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createPresenceServer, publicState, readTicket } from '../server/presence.mjs';
import { validVisuals, recordGraphics, interpolateVisuals } from '../public/game/combat-visuals.js';
import { RemoteMotion } from '../public/game/remote-motion.js';

const secret = 'only-for-tests';
const profile = id => ({ id, name: 'Joueur ' + id, skin: 'noe', level: 1,
    lease: `${String(id).padStart(8, '0')}-1111-4111-8111-111111111111`, exp: Math.floor(Date.now() / 1000) + 45 });
const ticket = p => { const payload = Buffer.from(JSON.stringify(p)).toString('base64url'); return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url'); };
const monster = { id: 'monster-1', texture: 'boar-motion', frame: 37, x: 80, y: 100, rotation: 0,
    scaleX: 1, scaleY: 1, originY: .75, alpha: 1, depth: 100, tint: 0xffffff, label: 'Sanglier N.1', health: .4 };
const state = () => ({ x: 100, y: 100, facing: 'east', walking: true, alive: true, attackFrame: -1,
    ranged: false, actions: [], visuals: { sprites: [monster], graphics: [[['fillStyle', 0xff0000, 1], ['fillRect', 75, 95, 10, 2]], []] } });

test('les tickets signés expirent et les états ne divulguent ni bail ni attributs de compte', () => {
    const p = profile(1);
    assert.equal(readTicket(ticket(p), secret).id, 1);
    assert.throws(() => readTicket(ticket(p) + 'x', secret));
    assert.throws(() => readTicket(ticket({ ...p, exp: 0 }), secret));
    const safe = publicState({ ...state(), id: 99, email: 'private', damage: 999999 }, p, Date.now());
    assert.equal(safe.id, 1);
    assert.equal(safe.visuals.sprites[0].health, .4);
    assert.equal('email' in safe || 'lease' in safe || 'damage' in safe, false);
    assert.throws(() => publicState({ ...state(), x: Infinity }, p, Date.now()));
});

test('les tracés visuels sont bornés et leur capture préserve le dessin local', () => {
    assert.equal(validVisuals(state().visuals), true);
    for (const command of [['destroy'], ['fillRect', 1], ['fillEllipse', 1, 2, 3, 4, 1000000], ['fillStyle', -1], ['arc', 1, 2, 3, 0, 1, 'bad']]) {
        assert.equal(validVisuals({ sprites: [], graphics: [[command], []] }), false);
    }
    const graphics = { count: 0, clear() { this.count = 0; return this; }, fillStyle() { return this; }, fillRect() { this.count++; return this; } };
    const old = graphics.fillRect, recording = recordGraphics(graphics);
    graphics.clear().fillStyle(0, 1).fillRect(1, 2, 3, 4);
    assert.equal(graphics.count, 1);
    assert.equal(recording.snapshot().length, 2);
    graphics.clear();
    assert.deepEqual(recording.snapshot(), []);
    recording.restore();
    assert.equal(graphics.fillRect, old);
    const a = state().visuals, b = { ...a, sprites: [{ ...monster, x: 120 }] };
    assert.equal(interpolateVisuals(a, b, .5).sprites[0].x, 100);
});

function waitMessage(ws, predicate) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { ws.off('message', listener); reject(new Error('Message attendu absent')); }, 3000);
        function listener(bytes) { const data = JSON.parse(bytes); if (predicate(data)) { clearTimeout(timer); ws.off('message', listener); resolve(data); } }
        ws.on('message', listener);
    });
}

test('deux connexions voient mouvement, monstre blessé et effets sans créditer de récompense', async t => {
    const relay = createPresenceServer({ secret, port: 0 });
    t.after(() => relay.close());
    await once(relay.server, 'listening');
    const port = relay.server.address().port, origin = `http://127.0.0.1:${port}`;
    async function connect(id) {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/monde-socket`, { origin });
        await once(ws, 'open');
        const ready = waitMessage(ws, d => d.type === 'ready');
        ws.send(JSON.stringify({ type: 'auth', token: ticket(profile(id)), at: 100 }));
        await ready;
        ws.send(JSON.stringify({ type: 'state', state: state() }));
        return ws;
    }
    const alice = await connect(1), bob = await connect(2);
    const snapshot = await waitMessage(bob, d => d.players?.length === 1);
    assert.equal(snapshot.onlineCount, 2);
    assert.equal(snapshot.players[0].name, 'Joueur 1');
    assert.equal(snapshot.players[0].visuals.sprites[0].texture, 'boar-motion');
    assert.equal(snapshot.players[0].visuals.sprites[0].health, .4);
    assert.equal(snapshot.players[0].visuals.graphics[0][1][0], 'fillRect');
    assert.equal('rewards' in snapshot.players[0], false);
    alice.send(JSON.stringify({ type: 'state', state: { ...state(), x: 120, visuals: { sprites: [], graphics: [[], []] } } }));
    const end = await waitMessage(bob, d => d.players?.[0]?.x === 120);
    assert.deepEqual(end.players[0].visuals.sprites, []);
    const duplicate = new WebSocket(`ws://127.0.0.1:${port}/monde-socket`, { origin });
    await once(duplicate, 'open');
    const closed = once(duplicate, 'close');
    duplicate.send(JSON.stringify({ type: 'auth', token: ticket(profile(1)), at: 0 }));
    assert.equal((await closed)[0], 4009);
    const rogue = new WebSocket(`ws://127.0.0.1:${port}/monde-socket`, { origin });
    await once(rogue, 'open');
    const refused = once(rogue, 'close');
    rogue.send(JSON.stringify({ type: 'auth', token: ticket(profile(3)) + 'bad', at: 0 }));
    assert.equal((await refused)[0], 4003);
    const malformed = once(bob, 'close');
    bob.send(JSON.stringify({ type: 'state', state: { ...state(), visuals: { sprites: [], graphics: [[['destroy']], []] } } }));
    assert.equal((await malformed)[0], 4003);
    const bobAgain = await connect(2);
    alice.close();
    const alone = await waitMessage(bobAgain, d => d.onlineCount === 1);
    assert.deepEqual(alone.players, []);
    bobAgain.close();
});

test('le flux continu reste fluide sous des arrivées irrégulières sans tampon de 850 ms', () => {
    const actor = new RemoteMotion(50);
    const packets = [];
    for (let sent = 0, i = 0; sent < 10000; sent += 50, i++) packets.push({ sent, arrived: sent + 90 + [20, 0, 35, 15, 5][i % 5] });
    let next = 0, previous, stalls = 0, largest = 0;
    for (let now = 0; now < 9000; now += 1000 / 60) {
        while (packets[next]?.arrived <= now) { const p = packets[next++]; actor.push({ x: p.sent * .092, y: 0, walking: true, alive: true }, p.sent, now); }
        if (!actor.samples.length) continue;
        const p = actor.sample(now);
        if (previous !== undefined && now > 1500) { const step = p.x - previous; if (step < .2) stalls++; largest = Math.max(largest, step); }
        previous = p.x;
    }
    assert.equal(stalls, 0);
    assert.ok(largest < 2.2, `Rattrapage brusque : ${largest}`);
    assert.ok(actor.delay < 300, `Retard excessif : ${actor.delay}`);
});
