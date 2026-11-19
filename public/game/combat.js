const counterRadius = 58;
const warningMs = 1000;
const counterIntervalMs = 2100;
const counterDamage = 9;
const impactMs = 190;
const sparks = [[-10, -3], [-7, 6], [-3, -9], [3, 9], [7, -7], [11, 2], [0, -11], [9, 6]];

export class TrainingCombat {
    constructor(scene, target, rules, ranged, tileSize) {
        this.scene = scene;
        this.target = target;
        this.rules = rules;
        this.ranged = ranged;
        this.range = rules.range * tileSize;
        this.status = document.getElementById('combat-status');
        this.resetButton = document.getElementById('combat-reset');
        this.buttons = [...document.querySelectorAll('[data-attack]')];
        this.meters = ['health', 'mana', 'target-health'].map(name => ({
            meter: document.getElementById('combat-' + name),
            value: document.getElementById('combat-' + name + '-value'),
        }));
        this.warning = scene.add.graphics().setDepth(1);
        this.effect = scene.add.graphics().setDepth(321);
        this.reset();
        document.getElementById('combat-vitals').hidden = false;
        document.getElementById('combat-actions').hidden = false;
    }

    reset() {
        this.health = this.rules.health;
        this.mana = this.rules.mana;
        this.targetHealth = this.meters[2].meter.max;
        this.readyAt = 0;
        this.counterAt = Infinity;
        this.warningEndsAt = 0;
        this.impacts = [];
        this.pending = null;
        this.strikeAt = -Infinity;
        this.warning.clear();
        this.effect.clear();
        this.scene.avatar.clearTint();
        this.target.clearTint().setAlpha(1);
        this.buttons.forEach(button => { button.disabled = false; });
        this.resetButton.hidden = true;
        this.refreshVitals();
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
            this.tell('Mana insuffisant. L’attaque de base est disponible.');
            return;
        }

        if (special) {
            this.mana -= this.rules.specialManaCost;
            this.refreshVitals();
        }
        this.readyAt = now + this.rules.cooldownMs;
        this.scene.face(this.target.x - this.scene.position.x, this.target.y - this.scene.position.y);
        const duration = this.ranged ? 260 : special ? 550 : 0;
        const attack = {
            color: special ? 0xff942f : this.ranged ? 0xc5f2ff : 0xffefd0,
            damage: special ? this.rules.specialDamage : this.rules.basicDamage,
            name: special ? this.rules.specialName : 'Attaque de base',
            start: now,
            end: now + duration,
            x: this.scene.position.x,
            y: this.scene.position.y - 18,
        };
        if (duration === 0) {
            this.resolveAttack(attack, now);
            return;
        }
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
    }

    resolveAttack(attack, now) {
        if (!this.ranged && this.targetDistance() > this.range) {
            this.tell('Saphyr est hors de portée.');
            return;
        }
        const damage = Math.min(attack.damage, this.targetHealth);
        this.targetHealth -= damage;
        this.refreshVitals();
        this.impacts.push({ x: this.target.x, y: this.target.y - 20, color: attack.color, start: now });
        if (!this.ranged) this.strikeAt = now;
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
            this.warning.fillStyle(0xff5738, .28).fillCircle(this.target.x, this.target.y, counterRadius);
            this.warning.lineStyle(2, 0xff5236, .95).strokeCircle(this.target.x, this.target.y, counterRadius);
            this.tell('Saphyr prépare sa riposte. Sors du cercle !');
        }
    }

    drawEffects(now) {
        if (!this.pending && this.impacts.length === 0) return;
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
        if (!this.pending) return;

        const attack = this.pending;
        const progress = Math.max(0, (now - attack.start) / (attack.end - attack.start));
        if (this.ranged) {
            const travel = Math.max(0, (progress - .17) / .83);
            const dx = this.target.x - attack.x;
            const dy = this.target.y - 20 - attack.y;
            for (let index = 3; index > 0; index--) {
                const tail = Math.max(0, travel - index * .055);
                this.effect.fillStyle(attack.color, .6 - index * .12).fillRect(
                    Math.round(attack.x + dx * tail) - 1, Math.round(attack.y + dy * tail) - 1, 3, 3);
            }
            const x = Math.round(attack.x + dx * travel);
            const y = Math.round(attack.y + dy * travel);
            this.effect.fillStyle(attack.color, 1).fillRect(x - 2, y - 3, 4, 6).fillRect(x - 3, y - 2, 6, 4);
            this.effect.fillStyle(0xfff3ca, 1).fillRect(x - 1, y - 1, 2, 2);
        } else {
            const { x, y } = this.scene.position;
            const size = 2 + Math.floor(progress * 3);
            this.effect.fillStyle(attack.color, .5 + progress * .35)
                .fillRect(Math.round(x) - size - 6, Math.round(y) + 1, size, 1)
                .fillRect(Math.round(x) + 7, Math.round(y) + 1, size, 1);
        }
    }

    attackLean(now) {
        if (this.pending && !this.ranged) {
            const progress = (now - this.pending.start) / (this.pending.end - this.pending.start);
            return -3 * Math.max(0, progress);
        }
        return 5 * Math.max(0, 1 - (now - this.strikeAt) / 120);
    }

    targetDistance() {
        return Math.hypot(this.target.x - this.scene.position.x, this.target.y - this.scene.position.y);
    }

    finish(message) {
        this.pending = null;
        this.warning.clear();
        this.buttons.forEach(button => { button.disabled = true; });
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
