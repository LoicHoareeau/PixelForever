import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldPresence } from '../public/game/world-presence.js';
import { RemoteMotion } from '../public/game/remote-motion.js';

test('50 ms de réponse ne doivent pas diviser la cadence réseau par deux', async t => {
    let now = 0, resolve;
    t.mock.method(performance, 'now', () => now);
    const starts = [];
    const presence = Object.create(WorldPresence.prototype);
    Object.assign(presence, { nextPoll: 0, request: () => {
        starts.push(now);
        return new Promise(done => { resolve = done; });
    } });
    for (const tick of [0, 300, 600, 900]) {
        now = tick; resolve = null;
        presence.poll();
        if (resolve) { now += 50; resolve(); await presence.pending; }
    }
    assert.deepEqual(starts, [0, 300, 600, 900]);
});

test('dix joueurs avancent sans arrêt entre paquets malgré des arrivées irrégulières', () => {
    const actors = Array.from({ length: 10 }, () => new RemoteMotion());
    const previous = Array(10).fill(null);
    let next = 0;
    for (let now = 0; now < 3600; now += 1000 / 60) {
        if (now >= next) {
            for (let i = 0; i < actors.length; i++) actors[i].push({ x: .092 * next, y: i * 16, alive: true, walking: true }, next);
            next += [270, 330, 300][Math.floor(next / 300) % 3];
        }
        actors.forEach((actor, i) => {
            const point = actor.sample(now);
            if (previous[i] && now > 900) {
                const step = point.x - previous[i].x;
                assert.ok(step > .5 && step < 4.1, `Pas irrégulier : ${step}`);
            }
            previous[i] = point;
        });
    }
});

test('la perte de paquets limite la prédiction et le rattrapage reste progressif', () => {
    const actor = new RemoteMotion();
    actor.push({ x: 0, y: 0, walking: true, alive: true }, 0);
    actor.push({ x: 27.6, y: 0, walking: true, alive: true }, 300);
    let previous;
    for (let now = 0; now < 2400; now += 16) {
        const point = actor.sample(now);
        assert.ok(point.x <= 41.5, 'Le joueur ne doit pas continuer indéfiniment sans réseau.');
        previous = point;
    }
    actor.push({ x: 138, y: 0, walking: false, alive: true }, 1500);
    for (let now = 2400; now < 3600; now += 16) {
        const point = actor.sample(now);
        assert.ok(Math.hypot(point.x - previous.x, point.y - previous.y) <= 3.85);
        previous = point;
    }
    assert.ok(Math.abs(previous.x - 138) < 1);
});

test('une vraie téléportation ne fait pas traverser toute la carte et oublie les anciennes actions', () => {
    const actor = new RemoteMotion();
    actor.push({ x: 0, y: 0, alive: true }, 0);
    actor.sample(0);
    assert.equal(actor.push({ x: 2000, y: 500, alive: true, actions: [['old', 0, 1000, 1210, true, 0]] }, 600), true);
    const point = actor.sample(600);
    assert.equal(point.x, 2000);
    assert.equal(point.action, null);
    actor.push({ x: 2000, y: 500, alive: true, actions: [['old', 0, 1000, 1210, true, 0]] }, 900);
    assert.equal(actor.actionAt(1000), null);
});

test('une animation distante déroule ses neuf poses et respecte une annulation', () => {
    const actor = new RemoteMotion();
    actor.push({ x: 0, y: 0, alive: true, actions: [['spell', 1000, 180, 390, true, 2]] }, 1200);
    const frames = new Set();
    for (let time = 1000; time < 1390; time += 1000 / 60) frames.add(actor.actionAt(time).frame);
    assert.deepEqual([...frames], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    actor.push({ x: 0, y: 0, alive: true, actions: [['spell', 1000, 180, 120, true, 2]] }, 1300);
    assert.equal(actor.actionAt(1120), null);
    assert.equal(actor.push({ x: 99, y: 0 }, 1000), false, 'Un ancien échantillon ne doit pas rembobiner le personnage.');
    assert.equal(actor.samples.length, 2);
});

test('les courtes attaques restent transmissibles après leur fin et leur identifiant n’est pas un bail', t => {
    const old = globalThis.document;
    globalThis.document = { hidden: false };
    t.after(() => { if (old === undefined) delete globalThis.document; else globalThis.document = old; });
    const presence = Object.create(WorldPresence.prototype);
    presence.actions = [];
    presence.scene = { position: { x: 0, y: 0 }, time: { now: 10 }, combat: { attackVisual: { start: 0, end: 140, ranged: false, facing: 'east' } } };
    presence.captureActions();
    const id = presence.actions[0].id;
    presence.scene.time.now = 450;
    presence.captureActions();
    assert.equal(presence.actions.length, 1);
    assert.equal(presence.actions[0].id, id);
    assert.equal(presence.actions[0].end, 350);
    globalThis.document.hidden = true;
    presence.captureActions();
    assert.equal(presence.actions.length, 0);
});

test('une erreur réseau isolée ne fait pas disparaître les joueurs ; une expiration les retire', async t => {
    let now = 1000, removed = 0;
    t.mock.method(performance, 'now', () => now);
    t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
    const presence = Object.create(WorldPresence.prototype);
    Object.assign(presence, { players: new Map([[1, {}]]), lastSnapshotAt: 0, notice: {}, counter: onlineCounter(), state: () => ({}),
        captureActions() {}, remove() { removed++; } });
    await presence.request();
    assert.equal(presence.players.size, 1);
    assert.equal(removed, 0);
    now = 13000;
    presence.update();
    assert.equal(presence.players.size, 0);
    assert.equal(removed, 1);
});

test('un acteur immobile ne réinitialise pas sa texture à chaque image', t => {
    t.mock.method(performance, 'now', () => 1000);
    let textures = 0;
    const actor = { x: 0, y: 0, setTexture() { textures++; return this; }, setOrigin() { return this; },
        setPosition() { return this; }, setDepth() { return this; }, setFlipX() { return this; }, setAlpha() { return this; } };
    const player = { sprite: actor, shadow: actor, label: actor, distance: 0, renderPosition: { x: 0, y: 0 },
        motion: { sample: () => ({ x: 0, y: 0, state: { skin: 'hunter', facing: 'east', alive: true } }) } };
    const presence = Object.create(WorldPresence.prototype);
    Object.assign(presence, { captureActions() {}, lastSnapshotAt: 1000, players: new Map([[1, player]]) });
    for (let i = 0; i < 120; i++) presence.update();
    assert.equal(textures, 1);
});

function onlineCounter() {
    return { textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
}

test('le compteur affiche le total serveur, puis une indisponibilité et la reconnexion', async t => {
    const replies = [
        { ok: true, json: async () => ({ players: [], onlineCount: 3 }) },
        new TypeError('offline'),
        { ok: true, json: async () => ({ players: [], onlineCount: 1 }) },
        { status: 409 },
        { ok: true, json: async () => ({ players: [], onlineCount: -1 }) },
    ];
    t.mock.method(globalThis, 'fetch', async () => {
        const reply = replies.shift();
        if (reply instanceof Error) throw reply;
        return reply;
    });
    const presence = Object.create(WorldPresence.prototype);
    Object.assign(presence, { players: new Map(), notice: {}, counter: onlineCounter(), state: () => ({}) });
    for (const expected of ['3', '—', '1', '—', '—']) {
        await presence.request();
        assert.equal(presence.counter.textContent, expected);
        assert.match(presence.counter.attributes['aria-label'], expected === '—' ? /indisponible/ : /connecté/);
    }
});
