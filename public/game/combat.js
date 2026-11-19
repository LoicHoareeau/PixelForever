const counterRadius = 58;
const warningMs = 1000;
const counterIntervalMs = 2100;
const counterDamage = 9;

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
        this.impact = null;
        this.pending = null;
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
        this.impact = { color: attack.color, end: now + 180 };
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
        if (!this.pending && !this.impact) return;
        this.effect.clear();
        if (this.impact) {
            if (now < this.impact.end) {
                this.effect.lineStyle(2, this.impact.color, .9).strokeCircle(this.target.x, this.target.y - 20, 11);
            } else {
                this.impact = null;
            }
        }
        if (!this.pending) return;

        const attack = this.pending;
        if (this.ranged) {
            const progress = (now - attack.start) / (attack.end - attack.start);
            const x = attack.x + (this.target.x - attack.x) * progress;
            const y = attack.y + (this.target.y - 20 - attack.y) * progress;
            this.effect.fillStyle(attack.color, 1).fillRect(x - 3, y - 3, 6, 6);
            this.effect.fillStyle(0xfff3ca, 1).fillRect(x - 1, y - 1, 2, 2);
        } else {
            this.effect.lineStyle(2, attack.color, .85).strokeCircle(this.scene.position.x, this.scene.position.y, 9);
        }
    }

    targetDistance() {
        return Math.hypot(this.target.x - this.scene.position.x, this.target.y - this.scene.position.y);
    }

    finish(message) {
        this.pending = null;
        this.warning.clear();
        this.effect.clear();
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
