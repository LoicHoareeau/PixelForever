import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basicWeaponProfile, computeCharacterStats, createInitialProgress } from '../public/game/progression.js';
import { classAttacks } from '../public/game/class-talents.js';
import { killXp, xpRequired, ordinaryStats, levelDamageFactor, skillCost, potionRestore } from '../public/game/balance.js';

export const rules = JSON.parse(execFileSync('php', [fileURLToPath(new URL('./balance-rules.php', import.meta.url))], { encoding: 'utf8' }));

// Référence reproductible : arme de départ, aucun talent/objet rare, 2 points offensifs + 1 Vitalité/niveau.
export function encounter(key, level, gap = 0, specialization = null, reserves = null) {
    const progress = createInitialProgress(level);
    progress.specialization = specialization;
    const primary = ['hunter', 'rogue'].includes(key) ? 'dexterity' : ['mage', 'warlock'].includes(key) ? 'intelligence' : 'strength';
    progress.allocatedStats[primary] = 2 * (level - 1);
    progress.allocatedStats.vitality = level - 1;
    const s = computeCharacterStats(rules[key], progress, 4);
    const basic = basicWeaponProfile(rules[key], progress, s, 16);
    const mob = ordinaryStats(level + gap);
    const factor = levelDamageFactor(level, level + gap);
    let hp = mob.maxHealth, mana = Math.min(reserves?.mana ?? s.maxMana, s.maxMana), ready = 0, specialCount = 0, incoming = 0;
    const cost = skillCost(rules[key].specialManaCost, s.maxMana, s.manaCostReduction);
    const technique = classAttacks[key]?.special;
    const impactDamage = (raw) => Math.max(1, Math.round(raw * factor));
    let time = 0, pending = null, dot = null, playerReady = 0;
    while (hp > 0 && time < 300) {
        if (pending && time >= pending.end) {
            hp -= impactDamage(pending.special ? s.specialDamage * (technique?.power ?? 1) : basic.damage);
            if (pending.special && technique?.dot) dot = { next: time + 1, remaining: technique.dot.ticks };
            pending = null;
        }
        if (hp <= 0) break;
        if (dot && time >= dot.next) {
            hp -= impactDamage(Math.round(s.specialDamage * technique.dot.scale));
            dot.remaining--; dot.next += 1;
            if (!dot.remaining) dot = null;
        }
        if (hp <= 0) break;
        if (!pending && time >= playerReady) {
            // Ne pas écraser ses propres dégâts périodiques ; conserver ensuite les autos.
            const special = mana >= cost && specialCount < 3 && !dot;
            if (special) { mana -= cost; specialCount++; }
            const cast = special && basic.ranged ? rules[key].specialCastMs / 1000 : basic.ranged ? .18 : 0;
            const flight = basic.ranged ? cast >= .5 ? .26 : special ? .17 : .15 : special ? .48 : .14;
            pending = { special, end: time + cast + flight };
            playerReady = time + .5;
        }
        if (time >= ready) {
            // Une esquive sur trois dans le parcours de référence.
            if (Math.round(ready / 1.8) % 3 !== 0) incoming += Math.max(1, Math.round(mob.damage * (1 - s.physicalMitigation) * (1 - s.damageReduction)));
            ready += mob.attackIntervalMs / 1000;
        }
        time = Math.round((time + .05) * 100) / 100;
        mana = Math.min(s.maxMana, mana + s.manaRegenPerSec * .05);
    }
    const afterPotion = Math.max(0, incoming - potionRestore(20, s.maxHealth));
    const recovery = Math.max(afterPotion / Math.max(1, s.maxHealth * .025), (s.maxMana - mana) / (s.manaRegenPerSec * 2.5));
    return { seconds: +time.toFixed(1), recovery: +recovery.toFixed(1), health: s.maxHealth, incoming, casts: specialCount, mana, maxMana: s.maxMana, manaRegen: s.manaRegenPerSec };
}

export function journey(key, specialization = null) {
    let seconds = 0, kills = 0;
    let healthPotions = 2, manaPotions = 2;
    for (let level = 1; level < 60; level++) {
        const count = xpRequired(level) / killXp(level);
        let reserves = null, hp = null;
        for (let kill = 0; kill < count; kill++) {
            const fight = encounter(key, level, 0, level >= 10 ? specialization : null, reserves);
            hp ??= fight.health; // Une montée de niveau restaure les réserves comme dans le jeu.
            hp -= fight.incoming;
            let usedPotion = false;
            if (healthPotions >= 1 && hp < fight.health * .7) {
                usedPotion = true;
                hp = Math.min(fight.health, hp + potionRestore(20, fight.health)); healthPotions--;
            }
            let mana = fight.mana;
            if (!usedPotion && manaPotions >= 1 && mana < fight.maxMana * .3) {
                mana = Math.min(fight.maxMana, mana + potionRestore(15, fight.maxMana)); manaPotions--;
            }
            if (hp <= 0) throw new Error(`Combat de référence fatal : ${key}, niveau ${level}`);
            const rest = Math.max(6, (fight.health * .8 - hp) / Math.max(1, fight.health * .025));
            hp = Math.min(fight.health, hp + rest * Math.max(1, fight.health * .025));
            reserves = { mana: Math.min(fight.maxMana, mana + rest * fight.manaRegen * 2.5) };
            // Espérance des tirages réellement livrés : 47 % vie, 30 % mana.
            healthPotions += .47; manaPotions += .30;
            seconds += fight.seconds + rest;
            kills++;
        }
    }
    return { minutes: Math.round(seconds / 60), kills };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.table(Object.keys(rules).map(key => ({ classe: key, ...journey(key), N1: encounter(key, 1).seconds,
        N10: encounter(key, 10).seconds, N30: encounter(key, 30).seconds, N60: encounter(key, 60).seconds,
        '+2 N30': encounter(key, 30, 2).seconds, '+3 N30': encounter(key, 30, 3).seconds })));
}
