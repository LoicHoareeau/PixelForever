import assert from 'node:assert/strict';
import test from 'node:test';
import { createProgressSync } from '../public/game/progress-sync.js';
import { createInitialProgress, saveProgress, setProgressSync } from '../public/game/progression.js';

function stubFetch(t, implementation) {
    const previous = globalThis.fetch;
    globalThis.fetch = implementation;
    t.after(() => { globalThis.fetch = previous; setProgressSync(null); });
}
const response = (level, xp) => ({ ok: true, json: async () => ({ level, xp }) });

test('les sauvegardes partagées envoient niveau/XP avec CSRF et survivent à une navigation', async t => {
    const calls = [];
    const states = [];
    stubFetch(t, async (url, options) => { calls.push({ url, ...options }); return response(1, 42); });
    const sync = createProgressSync('/personnages/1/progression', 'csrf-test', state => states.push(state));
    setProgressSync(sync);
    const progress = createInitialProgress();
    progress.xp = 42;
    saveProgress('character', progress);
    assert.equal(await sync.flush(), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/personnages/1/progression');
    assert.deepEqual(JSON.parse(calls[0].body), { level: 1, xp: 42, xpVersion: 2, _token: 'csrf-test' });
    assert.equal(calls[0].credentials, 'same-origin');
    assert.equal(calls[0].keepalive, true);
    assert.deepEqual(states, ['saving', 'saved']);
    saveProgress('character', progress);
    await sync.flush();
    assert.equal(calls.length, 1);
});

test('un échec réseau reste visible et la dernière progression est renvoyée à la reprise', async t => {
    const states = [];
    let fail = true;
    let calls = 0;
    stubFetch(t, () => { calls++; if (fail) throw new Error('offline'); return Promise.resolve(response(2, 17)); });
    const sync = createProgressSync('/save', 'csrf', state => states.push(state));
    sync.save({ level: 2, xp: 17 });
    assert.equal(await sync.flush(), false);
    assert.equal(states.at(-1), 'error');
    fail = false;
    assert.equal(await sync.flush(), true);
    assert.equal(calls, 2);
    assert.equal(states.at(-1), 'saved');
});

test('les réponses reçues dans le désordre ne remplacent pas la sauvegarde la plus récente', async t => {
    const replies = [];
    stubFetch(t, () => new Promise(resolve => replies.push(resolve)));
    const sync = createProgressSync('/save', 'csrf', () => {});
    sync.save({ level: 2, xp: 17 });
    const first = sync.flush();
    sync.save({ level: 2, xp: 42 });
    const last = sync.flush();
    await Promise.resolve();
    assert.equal(replies.length, 2);
    replies[1](response(2, 42));
    assert.equal(await last, true);
    replies[0](response(2, 42));
    assert.equal(await first, true);
    sync.save({ level: 2, xp: 42 });
    await sync.flush();
    assert.equal(replies.length, 2);
});

test('un refus HTTP ou une réponse trop ancienne ne confirme jamais une sauvegarde', async t => {
    let result = { ok: false };
    const states = [];
    stubFetch(t, async () => result);
    const sync = createProgressSync('/save', 'csrf', state => states.push(state));
    sync.save({ level: 3, xp: 77 });
    assert.equal(await sync.flush(), false);
    result = response(2, 99);
    assert.equal(await sync.flush(), false);
    assert.equal(states.at(-1), 'error');
    result = response(3, 77);
    assert.equal(await sync.flush(), true);
    assert.equal(states.at(-1), 'saved');
});
