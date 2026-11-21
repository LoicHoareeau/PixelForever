import { RemoteMotion } from './remote-motion.js';
const directions = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const equipped = ['hunter', 'rogue', 'warlock'];

export class WorldPresence {
    constructor(scene, rules) {
        this.scene = scene;
        this.url = rules.worldUrl;
        this.token = rules.progressToken;
        this.lease = crypto.randomUUID();
        this.players = new Map();
        this.nextPoll = 0;
        this.actions = [];
        this.lastSnapshotAt = performance.now();
        this.timer = setInterval(() => this.poll(), 300);
        this.notice = document.createElement('span');
        this.notice.className = 'world-presence-status';
        this.notice.setAttribute('role', 'status');
        this.notice.textContent = 'Connexion au monde…';
        this.counter = document.createElement('span');
        this.counter.className = 'world-online-count';
        this.counter.setAttribute('role', 'status');
        this.counter.setAttribute('aria-atomic', 'true');
        this.setOnlineCount(null);
        document.getElementById('world').after(this.notice, this.counter);
        this.pagehide = () => { void this.request(true); };
        window.addEventListener('pagehide', this.pagehide);
        scene.events.once('shutdown', () => {
            this.stopped = true;
            clearInterval(this.timer);
            this.controller?.abort();
            window.removeEventListener('pagehide', this.pagehide);
            this.notice.remove();
            this.counter.remove();
            for (const player of this.players.values()) this.remove(player);
        });
    }

    setOnlineCount(count) {
        const value = count === null ? '—' : String(count);
        if (this.counter.textContent === value) return;
        this.counter.textContent = value;
        const label = count === null ? 'Nombre de joueurs connectés indisponible' : count + ' joueur(s) connecté(s) sur le serveur';
        this.counter.setAttribute('aria-label', label);
        this.counter.title = label;
    }

    state() {
        const s = this.scene;
        this.captureActions();
        const gesture = document.hidden ? null : s.combat.attackPose(s.time.now);
        return { x: s.position.x, y: s.position.y, facing: gesture?.attack.facing ?? s.facing,
            walking: !document.hidden && s.time.now - s.lastWalkAt < 90, alive: s.combat.health > 0,
            attackFrame: gesture?.frame ?? -1, ranged: Boolean(gesture?.attack.ranged), actions: this.actions.map(action => [action.id,
                Math.max(0, Math.round(s.time.now - action.start)), action.windup, action.end, action.ranged, action.facing]) };
    }

    captureActions() {
        const now = this.scene.time.now;
        const visual = this.scene.combat.attackVisual;
        const position = this.scene.position;
        if (this.sourcePosition && Math.hypot(position.x - this.sourcePosition.x, position.y - this.sourcePosition.y) > 160) {
            this.actions = []; this.observedAttack = null;
        }
        this.sourcePosition = { x: position.x, y: position.y };
        if (document.hidden) { this.actions = []; this.observedAttack = null; return; }
        if (visual !== this.observedAttack) {
            const previous = this.actions.at(-1);
            if (previous) previous.end = Math.min(previous.end, Math.max(0, Math.round(now - previous.start)));
            this.observedAttack = visual;
            if (visual) {
                const windup = Math.max(1, Math.min(5000, Math.round(visual.ranged ? visual.castMs : visual.end - visual.start)));
                this.actions.push({ id: crypto.randomUUID(), start: visual.start, windup, end: windup + 210,
                    ranged: Boolean(visual.ranged), facing: Math.max(0, directions.indexOf(visual.facing)) });
            }
        }
        this.actions = this.actions.filter(action => now - action.start <= 6000).slice(-6);
    }

    async request(leave = false) {
        const sentAt = performance.now();
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
                this.setOnlineCount(null);
                return;
            }
            if (!response.ok) throw new Error('Presence unavailable');
            const snapshot = await response.json();
            if (!Array.isArray(snapshot.players) || !Number.isSafeInteger(snapshot.onlineCount) || snapshot.onlineCount < 1) throw new Error('Invalid presence');
            const now = performance.now();
            const serverTime = Number(snapshot.serverTime) || now;
            const offset = serverTime - (sentAt + now) / 2;
            this.serverOffset = this.serverOffset === undefined ? offset : this.serverOffset + Math.max(-5, Math.min(5, offset - this.serverOffset));
            this.lastSnapshotAt = now;
            const seen = new Set();
            for (const state of snapshot.players) {
                seen.add(state.id);
                let player = this.players.get(state.id);
                if (!player) {
                    player = { sprite: this.scene.add.image(state.x, state.y, state.skin + '-' + state.facing),
                        shadow: this.scene.add.ellipse(state.x, state.y - 1, 19, 7, 0x172622, .48).setDepth(3),
                        label: this.scene.add.text(state.x, state.y - 47, '', { fontFamily: 'system-ui, sans-serif',
                            fontSize: '8px', color: '#a8e6dd', stroke: '#101719', strokeThickness: 2 }).setOrigin(.5, 1),
                        distance: 0, motion: new RemoteMotion(), renderPosition: { x: state.x, y: state.y } };
                    this.players.set(state.id, player);
                }
                const teleported = player.motion.push(state, Number(state.updatedAt) || serverTime);
                if (teleported) { player.sprite.setPosition(state.x, state.y); player.renderPosition = { x: state.x, y: state.y }; player.distance = 0; }
                const label = `${state.name} · N.${state.level}`;
                if (player.label.text !== label) player.label.setText(label);
            }
            for (const [id, player] of this.players) {
                if (!seen.has(id)) { this.remove(player); this.players.delete(id); }
            }
            this.setOnlineCount(snapshot.onlineCount);
            this.notice.textContent = this.players.size ? `${this.players.size} joueur(s) à proximité` : 'Monde connecté';
            this.retry = false;
        } catch {
            if (!leave && !this.stopped) {
                this.retry = true;
                this.notice.textContent = 'Connexion interrompue · reconnexion…';
                this.setOnlineCount(null);
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    poll() {
        if (!this.stopped && !this.pending && performance.now() >= this.nextPoll) {
            const startedAt = performance.now();
            this.pending = this.request().finally(() => {
                this.pending = null;
                this.nextPoll = this.retry ? performance.now() + 1500 : Math.max(startedAt + 300, performance.now());
            });
        }
    }

    update() {
        this.captureActions();
        const clock = performance.now();
        if (clock - this.lastSnapshotAt > 12000) {
            for (const player of this.players.values()) this.remove(player);
            this.players.clear();
        }
        for (const player of this.players.values()) {
            const p = player.motion.sample(clock + (this.serverOffset ?? 0));
            const s = p.state;
            const moved = Math.hypot(p.x - player.renderPosition.x, p.y - player.renderPosition.y);
            player.renderPosition = { x: p.x, y: p.y };
            player.distance += moved;
            const walking = moved > .001 && s.alive;
            const legacyAction = !s.actions?.length && s.attackFrame >= 0
                ? { frame: s.attackFrame, ranged: s.ranged, facing: directions.indexOf(s.facing) } : null;
            const action = p.action ?? legacyAction;
            const row = action?.facing ?? directions.indexOf(s.facing);
            const facing = directions[row];
            const attackFrame = action?.frame ?? -1;
            const attack = attackFrame >= 0;
            let texture = s.skin + '-' + facing, frame = 0, origin = 1, flip = false;
            if (equipped.includes(s.skin)) {
                const pose = attack ? 'attack' : walking ? 'walk' : 'idle';
                texture = `${s.skin}-${pose}-equipped`;
                frame = attack ? row * 9 + attackFrame : walking ? row * 8 + Math.floor(player.distance / 7) % 8 : row;
                origin = 56 / 64;
            } else if (walking && !attack) {
                texture = s.skin + '-walk';
                const step = Math.floor(player.distance / 7);
                frame = row * 8 + (s.skin === 'noe' && facing === 'north-west' ? [0, 1, 2, 5, 6][step % 5] : step % 8);
            } else if (attack) {
                if (s.skin === 'noe' && (action.ranged || facing.startsWith('north'))) {
                    texture = s.skin + '-poses';
                    frame = facing + (attackFrame < 4 ? '-windup' : '-release');
                } else {
                    texture = s.skin + '-attack';
                    frame = s.skin === 'noe' ? attackFrame + (facing === 'south' ? 9 : 0) : row * 9 + attackFrame;
                    origin = s.skin === 'noe' ? 57 / 68 : 54 / 64;
                    flip = s.skin === 'noe' && facing.includes('west');
                }
            }
            if (player.texture !== texture || player.frame !== frame || player.origin !== origin) {
                player.sprite.setTexture(texture, frame).setOrigin(.5, origin);
                Object.assign(player, { texture, frame, origin });
            }
            player.sprite.setFlipX(flip).setPosition(Math.round(p.x), Math.round(p.y)).setDepth(p.y)
                .setAlpha(s.alive ? clock - this.lastSnapshotAt > 3000 ? .5 : 1 : .4);
            player.shadow.setPosition(p.x, p.y - 1);
            player.label.setPosition(p.x, p.y - 47).setDepth(p.y + 1);
        }
    }

    remove(player) {
        player.sprite.destroy(); player.shadow.destroy(); player.label.destroy();
    }
}
