import { drawInfernoBeam } from './combat-vfx.js';
import { bowGrip } from './equipped-art.js';
import { mageEffect } from './mage-art.js';
import { warlockAuraState, drawWarlockAura } from './warlock-vfx.js';
import { malakorIgnitionMs, malakorRageProgress, malakorSurgeMs, malakorWave, malakorWaveImpactMs } from './malakor.js';

export const impactMs = 210;
export const recoveryMs = 210;

const sparks = [
    [-10, -3],
    [-7, 6],
    [-3, -9],
    [3, 9],
    [7, -7],
    [11, 2],
    [0, -11],
    [9, 6],
];

export function drawEffectsView(combat, now) {
    combat.vfx?.begin();
    combat.rageEffect?.clear();
    const darkAura = warlockAuraState(combat,now);
    const rogueVenom = combat.classKey === 'rogue' && combat.scene.rogueArtReady && combat.health > 0
        && now < (combat.rogueVenomUntil ?? 0);
    const iceArmor = combat.classKey==='mage'&&combat.scene.mageArtReady&&combat.health>0
        &&(combat.progress.talents.m_ice_armor??0)>0;
    const enemyAttacking = combat.monsters.some((monster) => monster.isAlive && (
        (monster.isBoss && (monster.phase === 3 || monster.trial || monster.echo))
        || (monster.attackVisual && (monster.attackVisual.projectile || now < monster.attackVisual.end + recoveryMs))
    ));
    combat.spellEffects = (combat.spellEffects ?? []).filter((fx) => now - fx.start < fx.duration);
    if (!combat.pending && !combat.recovery && combat.impacts.length === 0 && combat.spellEffects.length === 0 && !enemyAttacking && !darkAura && !rogueVenom && !iceArmor) {
        combat.effect.clear();
        return;
    }

    combat.effect.clear();
    if (darkAura) drawWarlockAura(combat,darkAura,now);
    if(iceArmor)combat.vfx?.play('mage-ice-armor',combat.scene.position.x,combat.scene.position.y-20,
        combat.scene.motionPreference.matches ? .42 : (now%1200)/1200,.44,0,.34);
    if (rogueVenom) {
        const { x, y } = combat.scene.position;
        const progress = combat.scene.motionPreference.matches ? .4 : (now % 400) / 400;
        combat.vfx?.play('rogue-venom', x, y - 11, progress, .24, 0, .75);
    }
    combat.drawMonsterAttacks(now);
    combat.drawSpellEffects(now);
    combat.impacts = combat.impacts.filter((hit) => now - hit.start < impactMs);
    const still = combat.scene.motionPreference.matches;

    for (const hit of combat.impacts) {
        const progress = Math.max(0, (now - hit.start) / impactMs);
        const spread = still ? 0.65 : 0.45 + 0.9 * (1 - (1 - progress) ** 2);
        combat.effect.fillStyle(hit.color, 1 - progress);
        for (const [dx, dy] of sparks) {
            combat.effect.fillRect(Math.round(hit.x + dx * spread), Math.round(hit.y + dy * spread), 2, 2);
        }
        if (progress < 0.35) {
            combat.effect.fillStyle(0xffe3a6, 0.78 - progress);
            combat.effect.fillRect(Math.round(hit.x) - 2, Math.round(hit.y) - 2, 4, 4);
        }
    }

    if (combat.recovery) {
        const progress = (now - combat.recovery.start) / recoveryMs;
        if (progress < 1) {
            combat.drawMelee(combat.recovery, progress, false);
        } else {
            combat.recovery = null;
        }
    }

    if (!combat.pending) {
        return;
    }

    const attack = combat.pending;
    if (attack.kind === 'classCast' && attack.talent.technique.channel) {
        combat.drawDrain(attack, now, still);
        return;
    }
    if (attack.kind === 'talentCast' || attack.kind === 'classCast') {
        combat.drawCastCircle(now, attack.start, attack.castMs);
        return;
    }

    const target = attack.target;
    const progress = Math.max(0, (now - attack.start) / (attack.end - attack.start));
    if (attack.ranged && target) {
        const elapsed = now - attack.start;
        const flightSpan = Math.max(1, attack.end - attack.start - attack.castMs);
        const travel = Math.max(0, (elapsed - attack.castMs) / flightSpan);
        if (elapsed < attack.castMs) {
            if (attack.castMs >= 500) {
                combat.drawCastCircle(now, attack.start, attack.castMs);
            }
            attack.x = combat.scene.position.x + Math.cos(attack.angle) * 7;
            attack.y = combat.scene.position.y - 20 + Math.sin(attack.angle) * 4;
            if (attack.projectile === 'arrow') Object.assign(attack, bowGrip(combat.scene.position, attack.facing));
        }
        const x = attack.x + (target.sprite.x - attack.x) * travel;
        const y = attack.y + (target.sprite.y - 12 - attack.y) * travel;
        const angle = Math.atan2(target.sprite.y - 12 - attack.y, target.sprite.x - attack.x);
        const released = elapsed >= attack.castMs;
        if (attack.projectile === 'arrow' && !released) return;
        const mage = combat.classKey==='mage'&&combat.scene.mageArtReady;
        const size = mage ? (attack.special ? .5 : .25) : (attack.special ? .84 : .43);
        const hunterArrow = attack.projectile === 'arrow' && combat.scene.hunterArtReady;
        const kind=hunterArrow?'hunter-arrow':mageEffect(combat,attack.projectile??(attack.special?'firebolt':'arcane'));
        const cycle=still ? .4 : (elapsed%220)/220;
        const phase=kind==='mage-firebolt'?cycle*3/6:kind==='mage-arcane'?cycle*2/6:cycle;
        combat.vfx?.play(kind,x,y,phase,(released ? size : size * .44) * (hunterArrow ? .55 : 1), angle, released ? .94 : .78);
    } else {
        combat.drawMelee(attack, progress, true);
    }
}

export function drawCastCircleView(combat, now, start, castMs) {
    const progress = Math.max(0, Math.min(1, (now - start) / Math.max(1, castMs)));
    combat.vfx?.play('rune', combat.scene.position.x, combat.scene.position.y - 2,
        combat.scene.motionPreference.matches ? .42 : progress, .78, 0, .75 + .19 * progress);
}

export function drawDrainView(combat, cast, now, still) {
    const { x, y } = combat.scene.position;
    const dx = cast.target.sprite.x - x;
    const dy = cast.target.sprite.y - y + 4;
    const phase = still ? .42 : ((now - cast.start) % 500) / 500;
    combat.vfx?.play('drain', x + dx / 2, y - 16 + dy / 2, phase, .72, Math.atan2(dy, dx),
        .84, Math.max(.14, Math.hypot(dx, dy) / 80));
    combat.vfx?.play('curse', cast.target.sprite.x, cast.target.sprite.y - 12, phase, .64, 0, .85);
}

export function drawSpellEffectsView(combat, now) {
    if (!combat.vfx) return;
    const still = combat.scene.motionPreference.matches;
    for (const fx of combat.spellEffects ?? []) {
        const progress = Math.max(0, Math.min(1, (now - fx.start) / fx.duration));
        const pose = still ? .42 : progress;
        const alpha = .97 * (1 - Math.max(0, (progress - .52) / .48));
        const radius = fx.radius ?? 42;
        switch (fx.kind) {
        case 'taming_trap':
            if (fx.target.isAlive && now < fx.target.trappedUntil) {
                combat.vfx.play('trap', fx.target.sprite.x, fx.target.sprite.y - 3, .5, .8, 0, .95);
            }
            break;
        case 'class_vfx':
            combat.vfx.play(fx.row, fx.x, fx.y, pose, fx.size, fx.angle, alpha);
            break;
        case 'familiar_bolt': {
            if (!fx.target.isAlive) break;
            const dx = fx.target.sprite.x - fx.x;
            const dy = fx.target.sprite.y - 12 - fx.y;
            combat.vfx.play('firebolt', fx.x + dx * progress, fx.y + dy * progress, pose, .49, Math.atan2(dy, dx), .96);
            break;
        }
        case 'arcane_beam': {
            const dx = fx.targetX - fx.x;
            const dy = fx.targetY - fx.y;
            const angle = Math.atan2(dy, dx);
            if(combat.classKey==='mage'&&combat.scene.mageArtReady){
                const travel=still?1:Math.min(1,progress*3);
                if(travel<1)combat.vfx.play('mage-arcane',fx.x+dx*travel,fx.y+dy*travel,(pose%1)*2/6,.25,angle,alpha);
                else combat.vfx.play('mage-arcane',fx.targetX,fx.targetY,.5+pose*.5,.5,0,alpha);
                break;
            }
            const extension = still ? 1 : Math.min(1, .12 + progress * 3.6);
            const width = .90;
            if (progress < .8) {
                combat.vfx.play(mageEffect(combat,'arcane_stream'), fx.x + dx * extension / 2, fx.y + dy * extension / 2,
                    pose, width, angle, alpha, Math.max(.15, Math.hypot(dx, dy) * extension / (116 * width)));
            }
            if (extension === 1) combat.vfx.play(mageEffect(combat,'arcane_burst'), fx.targetX, fx.targetY, pose, .86, 0, alpha);
            break;
        }
        case 'fire_whirl':
            combat.vfx.play(mageEffect(combat,'vortex'), fx.x, fx.y - 25, pose, radius / 39, 0, alpha);
            break;
        case 'frost_nova':
            combat.vfx.play(mageEffect(combat,'frost'), fx.x, fx.y - 6, pose, radius / 41, 0, alpha);
            break;
        case 'shield_wave':
            combat.vfx.play('ward', fx.x, fx.y, pose, radius / 36, 0, alpha);
            break;
        case 'cleave':
            combat.vfx.play('gilded_spin', fx.x, fx.y + 2, pose, radius / 32, 0, alpha);
            break;
        case 'fire_wall':
            combat.vfx.play(mageEffect(combat,'flame'), fx.x, fx.y - 18, pose, radius / 47, 0, alpha, 1.10);
            break;
        case 'obsidian_impact':
            combat.vfx.play('slash', fx.x, fx.y - 5, pose, radius / 42, fx.angle, alpha);
            if (progress > .12) {
                combat.vfx.play('slash', fx.x, fx.y - 9, still ? .42 : Math.max(0, progress - .12),
                    radius / 55, fx.angle + .18, alpha * .44);
            }
            break;
        case 'magma_detonation':
            for (let offset = 12; offset <= fx.riftRange; offset += 21) {
                const local = still ? .42 : Math.max(.06, progress - offset / fx.riftRange * .18);
                const scale = .68 + (offset % 4) * .09;
                combat.vfx.play('magma', fx.x + fx.dirX * offset, fx.y + fx.dirY * offset - 30 * scale,
                    local, scale, 0, alpha);
            }
            break;
        case 'seismic_detonation':
        case 'engage_slam':
            combat.vfx.play('seismic', fx.x, fx.y - radius / 4, pose, radius / 43, 0, alpha);
            break;
        case 'fireball_burst':
            if(combat.classKey==='mage'&&combat.scene.mageArtReady)
                combat.vfx.play('mage-firebolt',fx.x,fx.y-18,.5+pose*.5,.65,0,alpha);
            else combat.vfx.play('fire_burst', fx.x, fx.y - 18, pose, 1.03, 0, alpha);
            break;
        case 'heavy_slash':
            combat.vfx.play('ward', fx.x, fx.y, pose, .43, 0, alpha * .85);
            break;
        case 'berserk_aura':
            combat.vfx.play('rune', fx.x, fx.y + 4, pose, .86, 0, alpha);
            break;
        case 'inferno_wake':
            combat.drawInfernoEmbers(fx, now, still);
            break;
        }
    }
}

export function drawMalakorArcView(combat, x, y, angle, radius, progress) {
    const spread = Math.acos(.35);
    combat.effect.fillStyle(0xf75127, .18 + progress * .2);
    combat.effect.lineStyle(2, 0xffc06b, .9);
    combat.effect.beginPath();
    combat.effect.moveTo(x, y);
    combat.effect.arc(x, y, radius, angle - spread, angle + spread);
    combat.effect.closePath();
    combat.effect.fillPath();
    combat.effect.strokePath();
}

export function drawMalakorAuraView(combat, monster, now) {
    const still = combat.scene.motionPreference?.matches;
    const time = still ? 0 : now;
    const x = monster.sprite.x;
    const y = monster.sprite.y;
    const buildup = malakorRageProgress(monster.rageStartedAt, now, malakorIgnitionMs);
    const ignition = buildup !== null;
    const heat = Math.max(.1, buildup ?? 1);
    const pulse = .5 + .5 * Math.sin(time / 230);
    const radius = 29 + 6 * pulse;

    combat.vfx?.play(ignition ? 'rage_ignition' : 'rage_aura', x, y - 30,
        still ? .42 : (ignition ? heat : (time % 1700) / 1700), ignition ? 1.49 : 1.22,
        0, ignition ? Math.sin(heat * Math.PI) * .82 : .54);

    combat.effect.fillStyle(0x482025, .32 * heat).fillEllipse(x, y + 2, 124, 58);
    combat.effect.fillStyle(0xe2502d, .17 * heat).fillEllipse(x, y + 2, 92, 40);
    combat.effect.fillStyle(0xff8c42, .14 * heat).fillEllipse(x, y + 2, 62, 26);
    combat.effect.lineStyle(2, 0xc3402d, .46 * heat).strokeEllipse(x, y + 2, radius * 2 + 25, radius + 13);
    combat.effect.lineStyle(1, 0xffbb70, .7 * heat).strokeEllipse(x, y + 2, radius * 2, radius);

    for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6 + time / 4600;
        const u = Math.cos(angle);
        const v = Math.sin(angle) * .48;
        const runeX = Math.round(x + u * (radius + 7));
        const runeY = Math.round(y + 2 + v * (radius + 7));
        combat.effect.lineStyle(1, i % 3 ? 0xffa359 : 0xffdda1, (.48 + .2 * pulse) * heat);
        combat.effect.lineBetween(runeX, runeY, runeX + u * 5 - v * 4, runeY + v * 5 + u * 2);
        combat.effect.lineBetween(runeX + u * 4, runeY + v * 4, runeX - v * 5, runeY + u * 3);
    }

    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + .18;
        let previousX = x + Math.cos(angle) * 18;
        let previousY = y + Math.sin(angle) * 10;
        for (let segment = 1; segment <= 4; segment++) {
            const fork = angle + Math.sin(i + segment * 2.3) * .19;
            const distance = (16 + segment * 11) * (.6 + .4 * heat);
            const nextX = Math.round(x + Math.cos(fork) * distance);
            const nextY = Math.round(y + Math.sin(fork) * distance * .53);
            combat.effect.lineStyle(3, 0x341724, .7).lineBetween(previousX, previousY, nextX, nextY);
            combat.effect.lineStyle(1, segment === 1 ? 0xffbd6b : 0xcf5034, (.78 - segment * .1) * heat)
                .lineBetween(previousX, previousY, nextX, nextY);
            previousX = nextX;
            previousY = nextY;
        }
    }

    if (still) return;
    for (let i = 0; i < 29; i++) {
        const life = (time / (720 + i % 6 * 85) + i * .271) % 1;
        const angle = i * 2.39996 + life * .54;
        const distance = 23 + i % 7 * 5 + life * 14;
        const px = Math.round(x + Math.cos(angle) * distance);
        const py = Math.round(y + Math.sin(angle) * distance * .42 - life * (36 + i % 5 * 9));
        const opacity = (1 - life) * heat;
        combat.effect.fillStyle(i % 4 ? 0xff8c46 : 0xffe6a1, opacity).fillRect(px, py, i % 3 ? 2 : 3, i % 4 ? 3 : 5);
    }
}

export function drawMalakorSurgeView(combat, monster, now) {
    const progress = malakorRageProgress(monster.rageStartedAt, now, malakorSurgeMs);
    const layer = combat.rageEffect;
    if (progress === null || !layer) return;
    const width = combat.scene.terrain[0].length * combat.tileSize;
    const height = combat.scene.terrain.length * combat.tileSize;
    const glow = Math.sin(progress * Math.PI) ** .85;
    const still = combat.scene.motionPreference?.matches;
    layer.fillStyle(0x5b2442, glow * (still ? .11 : .21)).fillRect(0, 0, width, height);
    layer.fillStyle(0xa53e26, glow * (still ? .06 : .14)).fillRect(0, 0, width, height);
    if (still) return;

    const { x, y } = monster.sprite;
    const front = 34 + Math.hypot(width, height) * progress ** 2.8;
    const power = (1 - progress) * glow;
    const view = combat.scene.cameras.main.worldView;
    const step = Math.max(120, Math.ceil(Math.sqrt(view.width * view.height / 38) / 16) * 16);
    for (let row = Math.max(0, Math.floor((view.y - step) / step)); row * step < Math.min(height, view.bottom + step); row++) {
        for (let col = Math.max(0, Math.floor((view.x - step) / step)); col * step < Math.min(width, view.right + step); col++) {
            const drift = Math.sin(col * 2.4 + row * 3.7) * 28;
            const px = (col + .5) * step + drift + progress * 37;
            const py = (row + .5) * step - drift - progress * 72;
            const phase = (progress * 1.6 + (col + row * 3) * .17) % 1;
            combat.vfx?.play('cinders', px, py, phase, 1.18, -.16, glow * .54);
        }
    }
    layer.lineStyle(25, 0xd43d2a, power * .28).strokeCircle(x, y, front);
    layer.lineStyle(10, 0xff713c, power * .42).strokeCircle(x, y, front);
    layer.lineStyle(3, 0xffba66, power * .64).strokeCircle(x, y, front);
    layer.lineStyle(2, 0xff874b, power * .38).strokeCircle(x, y, front * .73);
}

export function drawMalakorTrialView(combat, monster, now) {
    const { left, top, right, bottom } = monster.template.zone;
    const x = left * combat.tileSize;
    const y = top * combat.tileSize;
    const width = (right - left + 1) * combat.tileSize;
    const height = (bottom - top + 1) * combat.tileSize;
    const wave = malakorWave(monster.trial, now);
    combat.effect.lineStyle(2, monster.phase === 3 ? 0xffb080 : 0xffd98a, .9).strokeRect(x, y, width, height);
    if (!wave) {
        const progress = (now - monster.trial.start) / (monster.trial.beginsAt - monster.trial.start);
        const radius = 46 + 54 * progress;
        combat.effect.lineStyle(3, 0xffcf85, .9 - .48 * progress)
            .strokeCircle(monster.sprite.x, monster.sprite.y, radius);
        return;
    }
    combat.effect.fillStyle(0x84decb, .09).fillRect(x, y, width, height);
    const length = wave.vertical ? height : width;
    const still = combat.scene.motionPreference?.matches;
    for (const [from, to] of wave.danger) {
        const bounds = wave.vertical ? [from, y, to - from, height] : [x, from, width, to - from];
        combat.effect.fillStyle(wave.impact ? 0xff581e : 0x9b332b, wave.impact ? .24 : .26 + wave.progress * .25);
        combat.effect.fillRect(...bounds);
        combat.effect.lineStyle(2, 0xff905e, wave.impact ? .52 : .95).strokeRect(...bounds);
        if (wave.impact) {
            drawInfernoBeam(combat.effect, wave, x, y, from, to, length, monster.phase === 3, still);
            continue;
        }
        const center = (from + to) / 2;
        combat.effect.lineStyle(2, 0xdc7b48, .28 + wave.progress * .46);
        combat.effect.beginPath();
        for (let step = 0; step <= length; step += 12) {
            const offset = Math.sin(step * .162 + wave.index + center) * 6 + Math.cos(step * .07) * 3;
            const px = wave.vertical ? center + offset : x + step;
            const py = wave.vertical ? y + step : center + offset;
            if (step === 0) combat.effect.moveTo(px, py);
            else combat.effect.lineTo(px, py);
        }
        combat.effect.strokePath();
    }
}

export function drawInfernoEmbersView(combat, fx, now, still) {
    const { zone, wave } = fx;
    const length = (wave.vertical ? zone.bottom - zone.top + 1 : zone.right - zone.left + 1) * combat.tileSize;
    const axis = (wave.vertical ? zone.top : zone.left) * combat.tileSize;
    const elapsed = now - fx.start;
    const alongCount = Math.ceil(length / 64) * 4;
    const direction = wave.reverse ? -1 : 1;
    for (const [from, to] of wave.danger) {
        for (let index = 0; index < alongCount + 12; index++) {
            const seed = Math.abs(Math.sin(index * 97.3 + wave.index * 41.1 + from * .127));
            const atImpact = index >= alongCount;
            const distance = atImpact ? length - seed * 27 : Math.min(length, Math.floor(index / 4) * 64 + seed * 61);
            const ground = wave.reverse ? length - distance : distance;
            const delay = malakorWaveImpactMs * (.66 + seed * .32);
            const age = (elapsed - delay) / (fx.duration - delay);
            if (age <= 0 || age >= 1) continue;
            const drift = still ? 0 : age;
            const burst = 1 - (1 - Math.min(1, drift * 5)) ** 2;
            const hot = Math.max(0, 1 - age * 4);
            const opacity = (1 - age) ** 1.65 * Math.min(1, age * 48) * (still ? .45 : .90);
            const side = index % 2 === 0 ? 1 : -1;
            const cross = from + (to - from) * (.19 + seed * .62)
                + side * (atImpact ? 26 : 14) * burst + Math.sin(drift * 6 + index) * 7;
            const wind = axis + ground + direction * burst * (atImpact ? 15 + seed * 41 : 3 + seed * 13);
            const x = Math.round(wave.vertical ? cross : wind);
            const y = Math.round((wave.vertical ? wind : cross) - drift * (23 + seed * 44));
            const tail = Math.round(2 + (atImpact ? 14 : 7) * seed * hot);
            const trail = wave.reverse ? 0 : tail;
            const size = Math.round(2 + (atImpact ? 3 : 2) * seed * hot);
            combat.effect.fillStyle(0xd43f27, opacity * .64)
                .fillRect(x - (wave.vertical ? 0 : trail), y - (wave.vertical ? trail : 0),
                    wave.vertical ? size : tail, wave.vertical ? tail : size);
            combat.effect.fillStyle(hot > .60 ? 0xffedbb : seed > .6 ? 0xffac56 : 0xf16c39, opacity)
                .fillRect(x, y, size, size);
        }
    }
}

export function drawMonsterAttacksView(combat, now) {
    for (const monster of combat.monsters) {
        if (!monster.isAlive) continue;

        if (monster.isBoss && monster.phase === 3) {
            combat.drawMalakorAura(monster, now);
            combat.drawMalakorSurge(monster, now);
        }

        if (monster.trial) combat.drawMalakorTrial(monster, now);
        if (monster.echo) {
            const { x, y, inner, radius, start, end } = monster.echo;
            const progress = Math.max(0, Math.min(1, (now - start) / (end - start)));
            combat.effect.lineStyle(radius - inner, 0xdb5128, .22 + .24 * progress).strokeCircle(x, y, (inner + radius) / 2);
            combat.effect.lineStyle(2, 0xffc56c, .88).strokeCircle(x, y, inner).strokeCircle(x, y, radius);
        }

        const attack = monster.attackVisual;
        if (!attack || (!attack.projectile && !attack.special && now >= attack.end + recoveryMs)) continue;

        if (attack.special) {
            const progress = Math.max(0, Math.min(1, (now - attack.start) / Math.max(1, attack.castEnd - attack.start)));
            if (monster.isBoss) {
                const still = combat.scene.motionPreference.matches;
                const pose = still ? .4 : progress;
                combat.vfx?.play(attack.special === 'magma_rift' ? 'firebolt' : 'rune',
                    attack.originX, attack.originY - (attack.special === 'magma_rift' ? 34 : 0),
                    pose, .70 + progress * .19, attack.special === 'magma_rift' ? attack.angle : 0, .72);
            }
            if (attack.special === 'obsidian_cleave') {
                combat.drawMalakorArc(attack.originX, attack.originY, attack.angle, attack.radius, progress);
            } else if (attack.special === 'seismic_ring') {
                const r = attack.radius ?? 78;
                combat.effect.fillStyle(0xff4a24, 0.14 + progress * 0.18).fillEllipse(attack.originX, attack.originY, r * 2, r * 2);
                combat.effect.lineStyle(2, 0xff9f43, 0.85).strokeEllipse(attack.originX, attack.originY, r * 2, r * 2);
                combat.effect.lineStyle(1.5, 0xffe49c, 0.95).strokeEllipse(attack.originX, attack.originY, r * 2 * progress, r * 2 * progress);
            } else if (attack.special === 'magma_rift') {
                const endX = attack.originX + attack.dirX * attack.riftRange;
                const endY = attack.originY + attack.dirY * attack.riftRange;
                combat.effect.lineStyle(attack.halfWidth * 2, 0xff3b1f, 0.18 + progress * 0.22);
                combat.effect.lineBetween(attack.originX, attack.originY, endX, endY);
                combat.effect.lineStyle(2, 0xffc66e, 0.9);
                combat.effect.lineBetween(attack.originX, attack.originY, endX, endY);
            }
            continue;
        }

        const elapsed = now - attack.start;
        const color = monster.species === 'dragon' ? 0x7bdef2 : (monster.isBoss ? 0xff7a3d : 0xffba87);
        combat.effect.fillStyle(color, .9);
        if (attack.projectile) {
            const shot = attack.projectile;
            if (now < attack.castEnd) {
                combat.effect.fillStyle(color, .5);
                for (let step = 8; step <= shot.range; step += 8) {
                    const x = shot.x + shot.dx * step;
                    const y = shot.y + shot.dy * step;
                    if (!combat.scene.canStand(x, y)) break;
                    combat.effect.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 2);
                }
                combat.vfx?.play('frostbolt', attack.x, attack.y,
                    combat.scene.motionPreference.matches ? .4 : Math.min(1, elapsed / (attack.castEnd - attack.start)),
                    .44, attack.angle, .8);
                continue;
            }
            const x = shot.x + shot.dx * shot.distance;
            const y = shot.y + shot.dy * shot.distance - 8;
            combat.vfx?.play('frostbolt', x, y, combat.scene.motionPreference.matches ? .4 : (elapsed % 280) / 280,
                .62, Math.atan2(shot.dy, shot.dx));
        } else if (now >= attack.end) {
            const progress = Math.min(1, (now - attack.end) / recoveryMs);
            combat.vfx?.play('slash', attack.x, attack.y, combat.scene.motionPreference.matches ? .33 : progress,
                .37, attack.angle, .78 * (1 - progress));
        }
    }
}

export function drawMeleeView(combat, attack, progress, windingUp) {
    const x = combat.scene.position.x + Math.cos(attack.angle) * 4;
    const y = combat.scene.position.y - 17;
    const blade = attack.armed && !attack.staff;
    if (!windingUp && ['axe', 'daggers'].includes(attack.weaponStyle)) {
        const rogue = attack.weaponStyle === 'daggers' && combat.scene.rogueArtReady;
        combat.vfx?.play(rogue ? 'rogue-slash' : attack.weaponStyle === 'axe' ? 'axe_swing' : 'dagger', x, y,
            combat.scene.motionPreference.matches ? .42 : Math.min(.999, .17 + progress * .83),
            rogue ? .35 : attack.special ? .98 : .69, attack.angle, 1 - progress * .35);
        return;
    }
    if (windingUp && (!blade || !attack.special || progress < .34)) return;
    if (windingUp) {
        combat.vfx?.play('rune', x + Math.cos(attack.angle) * 7, y + 3, progress, .35, 0, .39);
        return;
    }
    const kind = blade ? (attack.special ? 'slash' : 'steel_slash') : 'ward';
    combat.vfx?.play(kind, x, y, combat.scene.motionPreference.matches ? .4 : progress,
        attack.special ? .91 : .54, attack.angle, 1 - progress * .55);
}

export function spawnFloatingTextView(combat, x, y, text, color = '#ffe3a6', now = 0) {
    if (typeof combat.scene?.add?.text !== 'function' || !combat.damageNumbers) {
        return;
    }
    const depth = (combat.scene.terrain?.length ?? 192) * combat.tileSize + 20;
    const label = combat.scene.add.text(Math.round(x), Math.round(y), text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '9px',
        fontStyle: 'bold',
        color,
        stroke: '#101719',
        strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(depth);
    combat.damageNumbers.push({ label, startY: y, start: now });
}

export function updateFloatingTextsView(combat, now) {
    if (!combat.damageNumbers || combat.damageNumbers.length === 0) {
        return;
    }
    const active = [];
    for (const entry of combat.damageNumbers) {
        const elapsed = now - entry.start;
        if (elapsed >= 650) {
            entry.label.destroy?.();
            continue;
        }
        const progress = elapsed / 650;
        entry.label.setY(Math.round(entry.startY - progress * 14));
        entry.label.setAlpha?.(Math.max(0, 1 - progress));
        active.push(entry);
    }
    combat.damageNumbers = active;
}

export function clearFloatingTextsView(combat) {
    for (const entry of combat.damageNumbers ?? []) {
        entry.label.destroy?.();
    }
    combat.damageNumbers = [];
}
