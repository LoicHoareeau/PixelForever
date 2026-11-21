const directions = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const equipped = ['hunter', 'rogue', 'warlock'];

export function interpolatePosition(start, end, fraction) {
    const t = Math.min(1, Math.max(0, fraction));
    return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

export class WorldPresence {
    constructor(scene, rules) {
        this.scene = scene;
        this.url = rules.worldUrl;
        this.token = rules.progressToken;
        this.lease = crypto.randomUUID();
        this.players = new Map();
        this.nextPoll = 0;
        this.timer = setInterval(() => this.poll(), 300);
        this.notice = document.createElement('span');
        this.notice.className = 'world-presence-status';
        this.notice.setAttribute('role', 'status');
        this.notice.textContent = 'Connexion au monde…';
        document.getElementById('world').after(this.notice);
        this.pagehide = () => { void this.request(true); };
        window.addEventListener('pagehide', this.pagehide);
        scene.events.once('shutdown', () => {
            this.stopped = true;
            clearInterval(this.timer);
            this.controller?.abort();
            window.removeEventListener('pagehide', this.pagehide);
            this.notice.remove();
            for (const player of this.players.values()) this.remove(player);
        });
    }

    state() {
        const s = this.scene;
        const gesture = s.combat.attackPose(s.time.now);
        return { x: s.position.x, y: s.position.y, facing: gesture?.attack.facing ?? s.facing,
            walking: s.time.now - s.lastWalkAt < 90, alive: s.combat.health > 0,
            attackFrame: gesture?.frame ?? -1, ranged: Boolean(gesture?.attack.ranged) };
    }

    async request(leave = false) {
        const controller = new AbortController();
        if (!leave) this.controller = controller;
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
            const response = await fetch(this.url, { method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ _token: this.token, lease: this.lease, state: this.state(), leave }),
                signal: controller.signal, keepalive: leave });
            if (leave || this.stopped) return;
            if (response.status === 409) {
                this.retry = true;
                this.notice.textContent = 'Personnage déjà connecté dans un autre onglet.';
                return;
            }
            if (!response.ok) throw new Error('Presence unavailable');
            const snapshot = await response.json();
            if (!Array.isArray(snapshot.players)) throw new Error('Invalid presence');
            const now = this.scene.time.now;
            const seen = new Set();
            for (const state of snapshot.players) {
                seen.add(state.id);
                let player = this.players.get(state.id);
                if (!player) {
                    player = { sprite: this.scene.add.image(state.x, state.y, state.skin + '-' + state.facing),
                        shadow: this.scene.add.ellipse(state.x, state.y - 1, 19, 7, 0x172622, .48).setDepth(3),
                        label: this.scene.add.text(state.x, state.y - 47, '', { fontFamily: 'system-ui, sans-serif',
                            fontSize: '8px', color: '#a8e6dd', stroke: '#101719', strokeThickness: 2 }).setOrigin(.5, 1),
                        distance: 0 };
                    this.players.set(state.id, player);
                }
                player.from = { x: player.sprite.x, y: player.sprite.y };
                player.state = state;
                player.start = now;
                player.label.setText(`${state.name} · N.${state.level}`);
            }
            for (const [id, player] of this.players) {
                if (!seen.has(id)) { this.remove(player); this.players.delete(id); }
            }
            this.notice.textContent = this.players.size ? `${this.players.size} joueur(s) à proximité` : 'Monde connecté';
            this.retry = false;
        } catch {
            if (!leave && !this.stopped) {
                this.retry = true;
                this.notice.textContent = 'Connexion interrompue · reconnexion…';
                for (const player of this.players.values()) this.remove(player);
                this.players.clear();
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    poll() {
        if (!this.stopped && !this.pending && performance.now() >= this.nextPoll) {
            this.pending = this.request().finally(() => {
                this.pending = null;
                this.nextPoll = performance.now() + (this.retry ? 1500 : 300);
            });
        }
    }

    update(now) {
        for (const player of this.players.values()) {
            const s = player.state;
            const p = interpolatePosition(player.from, s, this.scene.motionPreference.matches ? 1 : (now - player.start) / 300);
            player.distance += Math.hypot(p.x - player.sprite.x, p.y - player.sprite.y);
            const row = directions.indexOf(s.facing);
            const attack = s.attackFrame >= 0;
            let texture = s.skin + '-' + s.facing, frame = 0, origin = 1, flip = false;
            if (equipped.includes(s.skin)) {
                const pose = attack ? 'attack' : s.walking ? 'walk' : 'idle';
                texture = `${s.skin}-${pose}-equipped`;
                frame = attack ? row * 9 + s.attackFrame : s.walking ? row * 8 + Math.floor(player.distance / 7) % 8 : row;
                origin = 56 / 64;
            } else if (s.walking && !attack) {
                texture = s.skin + '-walk';
                const step = Math.floor(player.distance / 7);
                frame = row * 8 + (s.skin === 'noe' && s.facing === 'north-west' ? [0, 1, 2, 5, 6][step % 5] : step % 8);
            } else if (attack) {
                if (s.skin === 'noe' && (s.ranged || s.facing.startsWith('north'))) {
                    texture = s.skin + '-poses';
                    frame = s.facing + (s.attackFrame < 4 ? '-windup' : '-release');
                } else {
                    texture = s.skin + '-attack';
                    frame = s.skin === 'noe' ? s.attackFrame + (s.facing === 'south' ? 9 : 0) : row * 9 + s.attackFrame;
                    origin = s.skin === 'noe' ? 57 / 68 : 54 / 64;
                    flip = s.skin === 'noe' && s.facing.includes('west');
                }
            }
            player.sprite.setTexture(texture, frame).setOrigin(.5, origin).setFlipX(flip).setPosition(p.x, p.y).setDepth(p.y).setAlpha(s.alive ? 1 : .4);
            player.shadow.setPosition(p.x, p.y - 1);
            player.label.setPosition(p.x, p.y - 47).setDepth(p.y + 1);
        }
    }

    remove(player) {
        player.sprite.destroy(); player.shadow.destroy(); player.label.destroy();
    }
}
