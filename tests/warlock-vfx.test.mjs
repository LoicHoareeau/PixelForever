import assert from 'node:assert/strict';
import test from 'node:test';
import { warlockAuraState, drawWarlockAura } from '../public/game/warlock-vfx.js';
import { drawEffectsView } from '../public/game/combat-renderer.js';
import { TrainingCombat } from '../public/game/combat.js';

function fixture() {
    const calls=[];
    const effect={ clear() { calls.push(['clear']); }, fillStyle(...args) { calls.push(['color',...args]); return this; },
        fillEllipse(...args) { calls.push(['ellipse',...args]); return this; }, fillRect(...args) { calls.push(['fragment',...args]); return this; } };
    return { calls, combat:{ classKey:'warlock',health:45,
        attackVisual:{ start:100,castMs:1000,end:1100,ranged:true },
        scene:{position:{x:50,y:80},facing:'south',motionPreference:{matches:false}},
        effect,vfx:{begin(){},play(...args){calls.push(['vfx',...args]);}},
        monsters:[],impacts:[],spellEffects:[],drawMonsterAttacks(){},drawSpellEffects(){},
    } };
}

test('l’aura accompagne uniquement les sorts du Démoniste, puis disparaît après la dissipation', () => {
    const {combat}=fixture();
    assert.equal(warlockAuraState(combat,99),null);
    assert.ok(warlockAuraState(combat,600).strength > .9);
    assert.equal(warlockAuraState(combat,1520),null);
    combat.classKey='mage';
    assert.equal(warlockAuraState(combat,600),null);
    combat.classKey='warlock'; combat.attackVisual.ranged=false;
    assert.equal(warlockAuraState(combat,600),null);
    combat.attackVisual.ranged=true; combat.health=0;
    assert.equal(warlockAuraState(combat,600),null);
    combat.health=45; combat.attackVisual=null;
    assert.equal(warlockAuraState(combat,600),null);
});

test('la dissipation reste dessinée sans attaque en attente et suit le personnage', () => {
    const {combat,calls}=fixture();
    drawEffectsView(combat,1200);
    assert.ok(calls.some(c=>c[0]==='vfx' && c[1]==='chaos'));
    calls.length=0;
    combat.scene.position={x:90,y:120};
    drawEffectsView(combat,1300);
    assert.deepEqual(calls.find(c=>c[0]==='ellipse').slice(1,3),[90,119]);
    calls.length=0;
    drawEffectsView(combat,1520);
    assert.deepEqual(calls,[['clear']]);
});

test('mouvement réduit : volutes fixes sans fragments animés, lumière maintenue pendant le sort', () => {
    const {combat,calls}=fixture();
    combat.scene.motionPreference.matches=true;
    drawWarlockAura(combat,warlockAuraState(combat,500),500);
    assert.equal(calls.some(c=>c[0]==='fragment'),false);
    const first=calls.filter(c=>c[0]==='vfx');
    assert.ok(first.length>0);
    assert.ok(first.every(c=>c[4]===.42));
    calls.length=0;
    drawWarlockAura(combat,warlockAuraState(combat,700),700);
    assert.deepEqual(calls.filter(c=>c[0]==='vfx'),first);
});

test('le premier tic de Drain de vie ne remplace pas la canalisation par une pose de 210 ms', () => {
    const {combat}=fixture();
    combat.pending=combat.attackVisual={kind:'classCast',start:100,castMs:2000,end:2100,ranged:true};
    combat.spellCooldowns=new Map();
    combat.ranged=true;
    TrainingCombat.prototype.setSlotCooldown.call(combat,'drain_life',600,7200);
    assert.equal(combat.attackVisual,combat.pending);
    assert.ok(warlockAuraState(combat,2000).strength>.9);
    combat.pending=null;
    assert.ok(warlockAuraState(combat,2200).strength>0);
    assert.equal(warlockAuraState(combat,2520),null);
});
