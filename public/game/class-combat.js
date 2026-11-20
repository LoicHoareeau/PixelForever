import { inheritedPetStats } from './pet-rules.js';
import { monsterTemplates } from './monsters.js';
import { monsterArt, monsterFrames, monsterWalkFrames } from './monster-art.js';

const familiars = {
    imp: { row: 0, name: 'Diablotin', range: 76, cadence: 600, vfx: 'imp_flare' },
    succubus: { row: 1, name: 'Succube', range: 28, cadence: 650, vfx: 'curse' },
    void: { row: 2, name: 'Marcheur du Vide', range: 29, cadence: 900, vfx: 'chaos' },
};

export function classEffect(combat, row, point, now, angle = 0, size = .8, duration = 510) {
    combat.spellEffects?.push({ kind: 'class_vfx', row, x: point.x, y: point.y, angle, size, start: now, duration });
}

export function dismissFamiliar(combat) {
    combat.familiar?.meter?.destroy();
    combat.familiar?.actor.destroy();
    if (combat.spellEffects) combat.spellEffects = combat.spellEffects.filter(effect => effect.kind !== 'familiar_bolt');
    combat.familiar = null;
}

export function summonFamiliar(combat, kind, now) {
    dismissFamiliar(combat);
    const captured = kind === 'beast' ? combat.progress.capturedPet : null;
    const template = captured ? monsterTemplates[captured.species] : null;
    const species = template?.art ?? captured?.species;
    const art = monsterArt[species];
    const profile = captured ? { name: template.label, range: 28, cadence: 600, vfx: 'arrow_hit', art,
        frames: template.isBoss ? 48 : monsterFrames, walkFrames: template.isBoss ? 36 : monsterWalkFrames } : familiars[kind];
    const { x, y } = combat.scene.position;
    const beside = !combat.scene.canStand || combat.scene.canStand(x - 20, y + 3);
    const actor = combat.scene.add.image(Math.round(beside ? x - 20 : x), Math.round(beside ? y + 3 : y),
        captured ? species + '-motion' : 'class-familiars', captured ? 0 : profile.row * 6)
        .setOrigin(.5, captured ? (art.frame - 16) / art.frame : .875).setDepth(y + 3);
    if (captured) actor.setScale(Math.min(1, 42 / art.width));
    if (template?.tint) actor.setTint(template.tint);
    combat.familiar = { kind, profile, actor, x: actor.x, y: actor.y, nextHit: now + 800, target: null, summonedAt: now };
    const stats = inheritedPetStats(combat.stats, kind === 'void');
    Object.assign(combat.familiar, stats, { health: Math.max(1, Math.round(stats.maxHealth * (captured?.healthFraction || 1))),
        meter: combat.scene.add.rectangle(actor.x, actor.y - 28, 17, 2, 0x9b8eef).setDepth(y + 4) });
}

export function applyTechnique(combat, technique, target, damage, name, now, angle = 0, effectKey = name) {
    const origin = combat.scene.position;
    let point = target?.sprite ?? origin;
    if (technique.retreat) {
        const forward = combat.scene.facing;
        const dx = forward.includes('west') ? 1 : forward.includes('east') ? -1 : 0;
        const dy = forward.includes('north') ? 1 : forward.includes('south') ? -1 : 0;
        const step = 5 / (Math.hypot(dx, dy) || 1);
        point = { x: origin.x, y: origin.y };
        for (let i = 0; i < 8; i++) combat.scene.move(dx * step, dy * step, now);
    }
    if (technique.guard) {
        combat.guard = { until: now + technique.guard, oneHit: !!target };
        target?.pursue();
    }
    if (technique.summon) {
        summonFamiliar(combat, technique.summon, now);
        point = combat.familiar.actor;
    }
    const targets = technique.radius
        ? combat.monsters.filter(monster => monster.isAlive && Math.hypot(monster.sprite.x - point.x, monster.sprite.y - point.y) <= technique.radius)
        : target ? [target] : [];
    const talents = combat.progress.talents ?? {};
    if (technique.healPet && combat.familiar) {
        combat.familiar.health = Math.min(combat.familiar.maxHealth, combat.familiar.health + Math.round(combat.familiar.maxHealth * .3));
        point = combat.familiar.actor;
    }
    const direct = 1 + (talents.wl_ruin ?? 0) * .05;
    for (const monster of targets) {
        if (monster.trial) continue;
        if (technique.power) {
            const before = monster.health;
            combat.applyDamageToMonster(monster, Math.max(1, Math.round(damage * technique.power * direct)),
                name, 0xffc282, now, true);
            if (technique.healing && combat.health > 0) {
                combat.health = Math.min(combat.stats.maxHealth,
                    combat.health + Math.max(0, Math.round((before - monster.health) * technique.healing)));
                combat.refreshVitals();
            }
        }
        if (!monster.isAlive || monster.trial) continue;
        if (technique.dot) {
            const periodic = technique.dot;
            const dots = combat.periodicEffects ??= new Map();
            const effects = dots.get(monster) ?? new Map();
            const multiplier = 1 + ((talents.wl_affliction ?? 0) + (talents.r_venom ?? 0)) * .12;
            effects.set(effectKey, {
                name, tick: 0, remaining: periodic.ticks, next: now + 1000, ramp: periodic.ramp ?? 0,
                damage: damage * periodic.scale * multiplier, vfx: technique.vfx === 'fireball_burst' ? 'imp_flare' : technique.vfx,
            });
            dots.set(monster, effects);
        }
        if (technique.slow) monster.slowUntil = Math.max(monster.slowUntil, now + technique.slow * (monster.isBoss ? .25 : 1));
        if (technique.mark && combat.familiar?.kind === 'beast') {
            combat.familiar.mark = { target: monster, until: now + 6000 };
            combat.familiar.nextHit = now;
        }
        if ((technique.power || technique.dot) && combat.familiar && !combat.familiar.recalled) combat.familiar.target = monster;
        if (technique.dot && !technique.power) monster.pursue();
    }
    if (!technique.channel) {
        classEffect(combat, technique.vfx === 'fireball_burst' ? 'imp_flare' : technique.vfx,
            { x: point.x, y: point.y - (technique.summon ? 10 : 14) }, now, angle, technique.radius ? 1.05 : .88,
            technique.summon ? 890 : 550);
    }
}

export function updateClassCombat(combat, now, delta) {
    const dodging = combat.mustDodgeMalakor();
    for (const [monster, effects] of combat.periodicEffects ?? []) {
        if (!monster.isAlive || combat.health <= 0) {
            combat.periodicEffects.delete(monster);
            continue;
        }
        for (const [key, effect] of effects) {
            if (now < effect.next) continue;
            const missed = Math.floor((now - effect.next) / 1000);
            effect.next += (missed + 1) * 1000;
            effect.tick += missed;
            effect.remaining -= missed + 1;
            if (effect.remaining < 0) {
                effects.delete(key);
                continue;
            }
            if (!dodging && !monster.trial && monster.isAlive) {
                const damage = Math.max(1, Math.round(effect.damage * (1 + effect.tick * effect.ramp)));
                combat.applyDamageToMonster(monster, damage, effect.name, 0xd39cf3, now);
                classEffect(combat, effect.vfx, { x: monster.sprite.x, y: monster.sprite.y - 12 }, now, 0, .5, 390);
            }
            effect.tick++;
            if (!effect.remaining) effects.delete(key);
        }
        if (!effects.size) combat.periodicEffects.delete(monster);
    }
    const pet = combat.familiar;
    if (!pet) return;
    if (combat.health <= 0) {
        dismissFamiliar(combat);
        return;
    }
    const { actor, profile, kind } = pet;
    const stats = inheritedPetStats(combat.stats, kind === 'void');
    pet.health = Math.min(stats.maxHealth, pet.health * stats.maxHealth / pet.maxHealth);
    Object.assign(pet, stats);
    const target = pet.target;
    const player = combat.scene.position;
    const engaged = !pet.recalled && !combat.scene.isInStarterTown?.() && target?.isAlive && !target.trial && !dodging && combat.distanceTo(target) <= 130;
    const x = engaged ? target.sprite.x : player.x - 21;
    const y = engaged ? target.sprite.y : player.y + 8;
    const dx = x - (pet.x ?? actor.x);
    const dy = y - (pet.y ?? actor.y);
    const dist = Math.hypot(dx, dy);
    const reach = engaged ? profile.range : 2;
    const step = Math.min(Math.max(dist - reach, 0), Math.min(delta, 100) * .082);
    const nextX = (pet.x ?? actor.x) + dx * step / (dist || 1);
    const nextY = (pet.y ?? actor.y) + dy * step / (dist || 1);
    if (!combat.scene.canStand || combat.scene.canStand(nextX, nextY)) {
        pet.x = nextX;
        pet.y = nextY;
    } else if (nextX !== pet.x && combat.scene.canStand(nextX, pet.y)) {
        pet.x = nextX;
    } else if (nextY !== pet.y && combat.scene.canStand(pet.x, nextY)) {
        pet.y = nextY;
    } else if (!engaged && dist > 180) {
        pet.x = player.x;
        pet.y = player.y;
    }
    const pose = step > 0 ? Math.floor(now / 100) % 4 : Math.floor(now / 180) % 2;
    const striking = now < (pet.strikeUntil ?? 0);
    const direction = Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8;
    const frame = kind === 'beast' ? direction * profile.frames + (striking ? profile.walkFrames + 1 : step > 0 ? 1 + Math.floor(now / 45) % profile.walkFrames : 0)
        : profile.row * 6 + (striking ? 4 + (pet.strikeUntil - now > 170 ? 0 : 1) : pose);
    actor.setFrame(frame)
        .setFlipX(kind === 'beast' ? false : dx < -1 || (dx <= 1 && actor.flipX)).setPosition(Math.round(pet.x ?? actor.x), Math.round(pet.y ?? actor.y)).setDepth(pet.y ?? actor.y);
    pet.meter?.setPosition(actor.x, actor.y - 29).setDepth(pet.y + 1).setScale(pet.health / pet.maxHealth, 1);
    if (pet.bolt && now >= pet.bolt.end) {
        const shot = pet.bolt;
        pet.bolt = null;
        if (!dodging && shot.target.isAlive && !shot.target.trial && combat.distanceTo(shot.target) <= 130) {
            combat.applyDamageToMonster(shot.target, shot.damage, profile.name, 0xffbd75, now);
            classEffect(combat, 'imp_flare', { x: shot.target.sprite.x, y: shot.target.sprite.y - 12 }, now, 0, .57, 410);
        }
    }
    if (!engaged || !target.isAlive || target.trial || dist > reach + 1 || now < pet.nextHit) return;
    if (combat.scene.canStand) {
        const steps = Math.max(1, Math.ceil(dist / 4));
        for (let i = 1; i <= steps; i++) {
            if (!combat.scene.canStand(actor.x + (target.sprite.x - actor.x) * i / steps,
                actor.y + (target.sprite.y - actor.y) * i / steps)) return;
        }
    }
    const bond = combat.progress.talents?.[kind === 'beast' ? 'h_bond' : 'wl_bond'] ?? 0;
    const marked = pet.mark?.target === target && pet.mark.until > now;
    const damage = Math.max(1, Math.round(pet.damage * (1 + bond * .10) * (marked ? 1.45 : 1)));
    pet.nextHit = now + profile.cadence;
    pet.strikeUntil = now + 320;
    if (kind === 'imp') {
        pet.bolt = { target, damage, end: now + 240 };
        combat.spellEffects?.push({ kind: 'familiar_bolt', x: actor.x + (actor.flipX ? -5 : 5), y: actor.y - 13,
            target, start: now, duration: 240 });
        return;
    }
    if (kind === 'succubus') target.slowUntil = Math.max(target.slowUntil, now + (target.isBoss ? 275 : 1100));
    combat.applyDamageToMonster(target, damage, profile.name, 0xfad191, now);
    classEffect(combat, profile.vfx, { x: target.sprite.x, y: target.sprite.y - 13 }, now, Math.atan2(dy, dx), .57, 430);
}
