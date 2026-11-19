const counterRadius = 58;
const warningMs = 1000;
const counterIntervalMs = 2100;
const counterDamage = 9;
const impactMs = 190;
const sparks = [[-10, -3], [-7, 6], [-3, -9], [3, 9], [7, -7], [11, 2], [0, -11], [9, 6]];
const recoveryMs = 140;

export class TrainingCombat {
    constructor(scene, target, rules, ranged, tileSize) {
        this.scene = scene;
        this.target = target;
        this.rules = rules;
        this.ranged = ranged;
        this.range = rules.range * tileSize;
        this.status = document.getElementById('combat-status');
        this.resetButton = document.getElementById('combat-reset');
        this.targetHud = document.getElementById('combat-target');
        this.buttons = [...document.querySelectorAll('[data-attack]')];
        this.potionButtons = [...document.querySelectorAll('[data-potion]')];
        this.amounts = [...document.querySelectorAll('[data-quantity]')];
        this.equipButton = document.getElementById('inventory-equip');
        this.weaponStatus = document.getElementById('inventory-weapon-state');
        this.basicLabel = document.getElementById('combat-basic-name');
        this.meters = ['health', 'mana', 'target-health'].map(name => ({
            meter: document.getElementById('combat-' + name),
            value: document.getElementById('combat-' + name + '-value'),
        }));
        this.warning = scene.add.graphics().setDepth(1);
        this.effect = scene.add.graphics().setDepth(321);
        this.combatActions = document.getElementById('combat-actions');
        this.reset();
        document.getElementById('combat-vitals').hidden = false;
        document.getElementById('combat-actions').hidden = false;
    }

    reset() {
        this.health = this.rules.health;
        this.mana = this.rules.mana;
        this.targetHealth = this.meters[2].meter.max;
        this.readyAt = 0;
        this.cooldownStart = 0;
        this.counterAt = Infinity;
        this.warningEndsAt = 0;
        this.impacts = [];
        this.pending = null;
        this.recovery = null;
        this.potions = { health: 2, mana: 2 };
        this.equipped = true;
        this.warning.clear();
        this.effect.clear();
        this.scene.avatar.clearTint();
        this.target.clearTint().setAlpha(1);
        this.targetHud.hidden = true;
        this.buttons.forEach(button => { button.disabled = false; });
        this.resetButton.hidden = true;
        this.refreshVitals();
        this.refreshInventory();
        this.updateCooldown(0);
        this.tell('Approche-toi de Saphyr pour t’entraîner.');
    }

    attack(kind, now) {
        if (this.health === 0 || this.targetHealth === 0) return;
        if (this.pending || now < this.readyAt) {
            this.tell('L’attaque est en cours ou en recharge.');
            return;
        }
        if (this.targetDistance() > this.range) {
            this.tell('Saphyr est hors de portée. Approche-toi.');
            return;
        }
        const special = kind === 'special';
        if (special && this.mana < this.rules.specialManaCost) {
            this.tell(this.rules.resourceName + ' : réserve insuffisante. L’attaque de base est disponible.');
            return;
        }

        if (special) {
            this.mana -= this.rules.specialManaCost;
            this.refreshVitals();
        }
        this.targetHud.hidden = false;
        this.cooldownStart = now;
        this.readyAt = now + this.rules.cooldownMs;
        this.scene.face(this.target.x - this.scene.position.x, this.target.y - this.scene.position.y);
        const duration = this.ranged ? (special ? 410 : 260) : (special ? 550 : 140);
        const angle = Math.atan2(this.target.y - this.scene.position.y, this.target.x - this.scene.position.x);
        const attack = {
            color: special ? 0xff942f : this.ranged ? 0xb5b8ff : 0xffefd0,
            damage: special ? this.rules.specialDamage : this.rules.basicDamage + (this.equipped ? this.rules.weaponBonus : 0),
            name: special ? this.rules.specialName : this.basicName,
            special,
            armed: this.equipped,
            angle,
            facing: this.scene.facing,
            start: now,
            end: now + duration,
            castMs: special ? 110 : 55,
            x: this.scene.position.x + Math.cos(angle) * 7,
            y: this.scene.position.y - 20 + Math.sin(angle) * 4,
        };
        this.pending = attack;
        this.tell(attack.name + ' en cours.');
    }

    update(now) {
        if (this.pending && now >= this.pending.end) {
            const attack = this.pending;
            this.pending = null;
            this.resolveAttack(attack, now);
        }
        if (this.health > 0 && this.targetHealth > 0) this.updateCounter(now);
        this.drawEffects(now);
        this.updateCooldown(now);
    }

    updateCooldown(now) {
        const end = Math.max(this.readyAt, this.pending?.end ?? 0);
        const remaining = Math.max(0, end - now);
        const percent = remaining ? Math.ceil(100 * remaining / (end - this.cooldownStart)) : 0;
        if (percent === this.cooldownPercent) return;
        this.cooldownPercent = percent;
        this.combatActions.style.setProperty('--cooldown', percent + '%');
    }

    drinkPotion(type) {
        if (this.health === 0) return 'Reprends l’entraînement pour boire une potion.';
        if (!this.potions[type]) return 'Il ne reste plus de potion de ce type.';
        if (this[type] === this.rules[type]) return 'Cette réserve est déjà pleine.';
        const amount = Math.min(this.rules[type] - this[type], this.rules[type + 'Restore']);
        this[type] += amount;
        this.potions[type]--;
        this.refreshVitals();
        this.refreshInventory();
        this.impacts.push({
            x: this.scene.position.x, y: this.scene.position.y - 22,
            color: type === 'health' ? 0x9ee59e : 0xaec4ff, start: this.scene.time.now,
        });
        if (type === 'health') return '+' + amount + ' PV.';
        return '+' + amount + (this.ranged ? ' points de mana.' : ' points d’énergie.');
    }

    toggleWeapon() {
        this.equipped = !this.equipped;
        this.refreshInventory();
        return this.equipped ? 'Arme équipée.' : 'Arme rangée.';
    }

    refreshInventory() {
        this.amounts.forEach(amount => { amount.textContent = this.potions[amount.dataset.quantity]; });
        this.potionButtons.forEach(button => { button.disabled = this.health === 0; });
        this.equipButton.textContent = this.equipped ? 'Retirer' : 'Équiper';
        this.weaponStatus.textContent = this.equipped ? 'Équipé · +' + this.rules.weaponBonus + ' dégâts de base' : 'Dans le sac';
        this.basicLabel.textContent = this.basicName;
        this.buttons[0].title = this.basicName;
    }

    get basicName() {
        return this.equipped || this.ranged ? this.rules.basicName : 'Coup de poing';
    }

    resolveAttack(attack, now) {
        if (!this.ranged) this.recovery = { ...attack, start: now };
        if (!this.ranged && this.targetDistance() > this.range) {
            this.tell('Saphyr est hors de portée.');
            return;
        }
        const damage = Math.min(attack.damage, this.targetHealth);
        this.targetHealth -= damage;
        this.refreshVitals();
        this.impacts.push({ x: this.target.x, y: this.target.y - 20, color: attack.color, start: now });
        if (this.targetHealth === 0) {
            this.target.setAlpha(.55);
            this.finish('Saphyr s’incline. Entraînement réussi !');
            return;
        }
        if (this.counterAt === Infinity) this.counterAt = now + 450;
        this.tell(attack.name + ' · ' + damage + ' dégâts.');
    }

    updateCounter(now) {
        if (this.warningEndsAt) {
            if (now < this.warningEndsAt) return;
            this.warningEndsAt = 0;
            this.counterAt = now + counterIntervalMs;
            this.warning.clear();
            this.target.clearTint();
            if (this.targetDistance() > counterRadius) {
                this.tell('Tu as esquivé la riposte de Saphyr.');
                return;
            }
            this.health = Math.max(0, this.health - counterDamage);
            this.impacts.push({
                x: this.scene.position.x, y: this.scene.position.y - 17, color: 0xf78863, start: now,
            });
            this.refreshVitals();
            if (this.health === 0) {
                this.scene.avatar.setTint(0xbb6666);
                this.finish('Saphyr a remporté le duel.');
                return;
            }
            this.tell('La riposte de Saphyr te touche.');
            return;
        }

        if (now >= this.counterAt && this.targetDistance() <= counterRadius) {
            this.warningEndsAt = now + warningMs;
            this.target.setTint(0xffbc91);
            this.warning.fillStyle(0xff5738, .28).fillCircle(this.target.x, this.target.y, counterRadius);
            this.warning.lineStyle(2, 0xff5236, .95).strokeCircle(this.target.x, this.target.y, counterRadius);
            this.tell('Saphyr prépare sa riposte. Sors du cercle !');
        }
    }

    drawEffects(now) {
        if (!this.pending && !this.recovery && this.impacts.length === 0) return;
        this.effect.clear();
        this.impacts = this.impacts.filter(hit => now - hit.start < impactMs);
        const still = this.scene.motionPreference.matches;
        for (const hit of this.impacts) {
            const progress = Math.max(0, (now - hit.start) / impactMs);
            const spread = still ? .65 : .45 + .9 * (1 - (1 - progress) ** 2);
            this.effect.fillStyle(hit.color, 1 - progress);
            for (const [dx, dy] of sparks) {
                this.effect.fillRect(Math.round(hit.x + dx * spread), Math.round(hit.y + dy * spread), 2, 2);
            }
            if (progress < .35) {
                this.effect.fillStyle(0xffe3a6, .78 - progress);
                this.effect.fillRect(Math.round(hit.x) - 2, Math.round(hit.y) - 2, 4, 4);
            }
        }
        if (this.recovery) {
            const progress = (now - this.recovery.start) / recoveryMs;
            if (progress < 1) this.drawMelee(this.recovery, progress, false);
            else this.recovery = null;
        }
        if (!this.pending) return;

        const attack = this.pending;
        const progress = Math.max(0, (now - attack.start) / (attack.end - attack.start));
        if (this.ranged) {
            const elapsed = now - attack.start;
            const travel = Math.max(0, (elapsed - attack.castMs) / (attack.end - attack.start - attack.castMs));
            if (elapsed < attack.castMs) {
                attack.x = this.scene.position.x + Math.cos(attack.angle) * 7;
                attack.y = this.scene.position.y - 20 + Math.sin(attack.angle) * 4;
                if (attack.armed) {
                    this.effect.fillStyle(0x916b52, 1);
                    this.strokePixels(attack.x, attack.y + 11, -1.35, 16, 2);
                }
            }
            const dx = this.target.x - attack.x;
            const dy = this.target.y - 20 - attack.y;
            for (let index = 3; index > 0; index--) {
                const tail = Math.max(0, travel - index * .055);
                this.effect.fillStyle(attack.color, .6 - index * .12).fillRect(
                    Math.round(attack.x + dx * tail) - 1, Math.round(attack.y + dy * tail) - 1, 3, 3);
            }
            const x = Math.round(attack.x + dx * travel);
            const y = Math.round(attack.y + dy * travel);
            const size = elapsed < attack.castMs ? 1 + Math.floor(elapsed / attack.castMs * 2) : attack.special ? 4 : 3;
            const core = Math.max(1, size * 2 - 2);
            this.effect.fillStyle(attack.color, 1).fillRect(x - size + 1, y - size, core, size * 2)
                .fillRect(x - size, y - size + 1, size * 2, core);
            this.effect.fillStyle(attack.special ? 0xffe1a0 : 0xf3eaff, 1).fillRect(x - 1, y - 1, 2, 2);
            if (attack.special && !still) this.orbitSparks(x, y, elapsed);
        } else {
            this.drawMelee(attack, progress, true);
        }
    }

    drawMelee(attack, progress, windingUp) {
        const still = this.scene.motionPreference.matches;
        const angle = attack.angle + (still ? (windingUp ? -1 : .4) : windingUp ? -.35 - .95 * progress : -1.25 + 2.55 * progress);
        const x = this.scene.position.x + Math.cos(attack.angle) * 5;
        const y = this.scene.position.y - 19;
        const length = attack.armed ? (attack.special ? 21 : 17) : 7;
        if (attack.armed) {
            this.effect.fillStyle(0x443443, 1);
            this.strokePixels(x, y, angle, length, 3);
            this.effect.fillStyle(windingUp ? 0xc2af8d : attack.color, 1);
            this.strokePixels(x, y, angle, length, 1);
        } else {
            this.effect.fillStyle(0xe8ad84, 1).fillRect(Math.round(x + Math.cos(angle) * length) - 2,
                Math.round(y + Math.sin(angle) * length * .65) - 2, 4, 4);
        }
        if (!windingUp && !still) {
            this.effect.fillStyle(attack.color, .85 * (1 - progress));
            for (let step = 0; step < 7; step++) {
                const trail = angle - step * .12;
                this.effect.fillRect(Math.round(x + Math.cos(trail) * length) - 1,
                    Math.round(y + Math.sin(trail) * length * .65) - 1, 3, 3);
            }
        }
    }

    strokePixels(x, y, angle, length, width) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle) * .65;
        for (let step = 0; step <= length; step++) {
            const inset = Math.floor(width / 2);
            this.effect.fillRect(Math.round(x + dx * step) - inset, Math.round(y + dy * step) - inset, width, width);
        }
    }

    orbitSparks(x, y, elapsed) {
        this.effect.fillStyle(0xf7b75f, .8);
        for (let index = 0; index < 3; index++) {
            const angle = elapsed / 41 + index * 2.1;
            this.effect.fillRect(Math.round(x + Math.cos(angle) * 6), Math.round(y + Math.sin(angle) * 5), 2, 2);
        }
    }

    attackPose(now) {
        if (this.recovery) return { attack: this.recovery, pose: 'release' };
        if (!this.pending) return null;
        const elapsed = now - this.pending.start;
        if (!this.ranged || elapsed < this.pending.castMs) return { attack: this.pending, pose: 'windup' };
        return elapsed < this.pending.castMs + 100 ? { attack: this.pending, pose: 'release' } : null;
    }

    targetDistance() {
        return Math.hypot(this.target.x - this.scene.position.x, this.target.y - this.scene.position.y);
    }

    finish(message) {
        this.pending = null;
        this.warning.clear();
        this.target.clearTint();
        this.buttons.forEach(button => { button.disabled = true; });
        this.refreshInventory();
        this.resetButton.hidden = false;
        this.tell(message);
    }

    refreshVitals() {
        [this.health, this.mana, this.targetHealth].forEach((amount, index) => {
            const { meter, value } = this.meters[index];
            meter.value = amount;
            value.textContent = amount + ' / ' + meter.max;
        });
    }

    tell(message) {
        if (this.status.textContent !== message) this.status.textContent = message;
    }
}
