import { updateCooldownsUi } from '../public/game/combat-ui.js';
import { spellIconKeys, spellIconPosition } from '../public/game/spell-icons.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spellState, cooldownLabel } from '../public/game/spell-state.js';
import { talentTrees, createInitialProgress } from '../public/game/progression.js';
import { starterTalents } from '../public/game/class-talents.js';
import { appendChatMessage } from '../public/game/chat.js';

test('le manque de ressource grise le sort, pas l’auto-attaque, puis disparaît après régénération', () => {
    const combat = { mana: 10, health: 40, readyAt: 0, rules: { specialManaCost: 14 }, stats: { maxMana: 40 }, spellCooldowns: new Map() };
    assert.equal(spellState(combat, 'special', 0).noResource, true);
    assert.equal(spellState(combat, 'special', 0).unavailable, true);
    assert.equal(spellState(combat, 'basic', 0).unavailable, false);
    assert.equal(spellState(combat, 'taming_trap', 0, { manaCost: 6 }).cost, 12);
    combat.mana = 14;
    assert.equal(spellState(combat, 'special', 0).unavailable, false);
    combat.pending = { kind: 'classCast' };
    assert.equal(spellState(combat, 'special', 0).blocked, true);
    combat.pending = null; combat.health = 0;
    assert.equal(spellState(combat, 'basic', 0).unavailable, true);
});

test('le compteur suit la recharge réelle et ne dit jamais prêt avant son échéance', () => {
    const combat = { mana: 40, health: 40, readyAt: 1500, rules: { specialManaCost: 14 }, stats: { maxMana: 40 },
        spellCooldowns: new Map([['taming_trap', { start: 0, end: 20000 }]]) };
    assert.equal(spellState(combat, 'basic', 1000).remaining, 500);
    assert.equal(cooldownLabel(spellState(combat, 'taming_trap', 1200, { manaCost: 6 }).remaining), '19s');
    assert.equal(cooldownLabel(1), '0.1s');
    assert.equal(cooldownLabel(9999), '10.0s');
    assert.equal(cooldownLabel(0), '');
    assert.equal(spellState(combat, 'taming_trap', 20000, { manaCost: 6 }).unavailable, false);
});

test('chaque sort actif et chaque classe disposent d’une icône distincte versionnée', () => {
    const keys = ['mage_staff', 'warrior_axe', 'unarmed_basic', 'tame', 'recall', 'dismiss'];
    for (const [key, tree] of Object.entries(talentTrees)) {
        keys.push(key + '_basic', key + '_special');
        keys.push(...[...(starterTalents[key] ?? []), ...tree.branches.flatMap(branch => branch.talents)].filter(talent => talent.type === 'active').map(talent => talent.slot));
    }
    for (const key of new Set(keys)) assert.notEqual(spellIconPosition(key), null, key);
    assert.equal(new Set(spellIconKeys.map(spellIconPosition)).size, spellIconKeys.length);
    assert.equal(spellIconPosition('inconnu'), null);
    const atlas = readFileSync(new URL('../public/game/spell-icons-atlas.png', import.meta.url));
    assert.equal(atlas.subarray(1, 4).toString(), 'PNG');
    assert.ok(Math.abs(atlas.readUInt32BE(16) / 8 - atlas.readUInt32BE(20) / 6) < 2, 'Les cellules doivent être carrées.');

});


test('la case reflète immédiatement le manque de mana et devient disponible à la fin de recharge', t => {
    const previous = globalThis.document;
    globalThis.document = { createElement: () => ({}) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const button = name => ({
        dataset: {}, values: {}, nodes: { '.slot-name': { textContent: name }, '.slot-cd': { textContent: '' } },
        style: { setProperty() {} }, setAttribute(key, value) { this.values[key] = value; },
        querySelector(key) { return this.nodes[key] ?? null; }, append(node) { this.nodes['.' + node.className] = node; },
    });
    const combat = { buttons: [button('Trait'), button('Boule de feu')], potionButtons: [], talentSlotButtons: [],
        mana: 0, health: 40, classKey: 'mage', progress: createInitialProgress(), readyAt: 0,
        rules: { specialManaCost: 14, resourceName: 'Mana' }, stats: { maxMana: 40 },
        spellCooldowns: new Map([['special', { start: 0, end: 1000 }]]) };
    updateCooldownsUi(combat, 0);
    assert.equal(combat.buttons[1].dataset.noResource, 'true');
    assert.equal(combat.buttons[1].disabled, true);
    assert.equal(combat.buttons[1].nodes['.slot-cd'].textContent, '1.0s');
    assert.equal(combat.buttons[0].disabled, false);
    combat.mana = 40;
    updateCooldownsUi(combat, 20);
    assert.equal(combat.buttons[1].dataset.noResource, 'false');
    assert.equal(combat.buttons[1].disabled, true);
    updateCooldownsUi(combat, 1000);
    assert.equal(combat.buttons[1].disabled, false);
    assert.equal(combat.buttons[1].nodes['.slot-cd'].textContent, '');
    combat.mana = 0;
    updateCooldownsUi(combat, 1001);
    assert.equal(combat.buttons[1].dataset.noResource, 'true');
    assert.equal(combat.buttons[0].disabled, false);
});

test('le tchat rend les noms et messages comme du texte, et borne son historique affiché', t => {
    class Element {
        children = []; dataset = {}; scrollTop = 0; scrollHeight = 100; clientHeight = 100;
        append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
        get firstElementChild() { return this.children[0]; }
        remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    }
    const previous = globalThis.document;
    globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const log = new Element();
    const message = { sender_name: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>', channel: 'whisper', created_at: 1 };
    appendChatMessage(log, message);
    assert.equal(log.children[0].children[1].textContent, message.body);
    assert.ok(log.children[0].children[0].textContent.includes(message.sender_name));
    for (let i = 0; i < 205; i++) appendChatMessage(log, { ...message, body: String(i) });
    assert.equal(log.children.length, 200);
    assert.equal(log.children[0].children[1].textContent, '5');
});
