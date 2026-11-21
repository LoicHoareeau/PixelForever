export const channelLabels = { global: 'Global', group: 'Groupe', whisper: 'Chuchotement', nearby: 'Proximité' };

export function appendChatMessage(log, message) {
    const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 35;
    const row = document.createElement('p');
    row.dataset.channel = message.channel;
    const heading = document.createElement('strong');
    const time = new Date(Number(message.created_at) * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    heading.textContent = `[${time} · ${channelLabels[message.channel] ?? 'Tchat'}] ${message.sender_name}${message.target_name ? ' → ' + message.target_name : ''} : `;
    row.append(heading, document.createTextNode(message.body));
    log.append(row);
    while (log.children.length > 200) log.firstElementChild.remove();
    if (pinned) log.scrollTop = log.scrollHeight;
}

export class GameChat {
    constructor(scene, rules) {
        this.scene = scene; this.rules = rules; this.cursor = 0; this.seen = new Set(); this.unread = 0;
        const byId = id => document.getElementById('chat-' + id);
        this.root = document.getElementById('game-chat');
        this.log = byId('log'); this.status = byId('status'); this.input = byId('input'); this.target = byId('target');
        this.channel = byId('channel'); this.form = byId('form'); this.sendButton = byId('send');
        this.events = new AbortController();
        const signal = this.events.signal;
        this.root.addEventListener('focusin', () => { scene.heldKeys.clear(); scene.buttonMove = null; }, { signal });
        this.root.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') { event.preventDefault(); this.input.blur(); scene.game.canvas.focus(); }
        }, { signal });
        this.root.addEventListener('toggle', () => { if (this.root.open) { this.unread = 0; byId('count').textContent = ''; } }, { signal });
        window.addEventListener('keydown', event => {
            if (event.defaultPrevented || event.repeat || event.key !== 'Enter' || event.ctrlKey || event.altKey || event.metaKey) return;
            if (event.target !== document.body && event.target !== scene.game.canvas) return;
            if (document.querySelector('dialog[open]')) return;
            event.preventDefault(); scene.heldKeys.clear(); scene.buttonMove = null;
            this.root.open = true; this.input.focus();
        }, { signal });
        this.form.addEventListener('submit', async event => {
            event.preventDefault();
            const payload = { action: 'send', channel: this.channel.value, target: this.target.value, text: this.input.value.trim() };
            if (!payload.text || this.sending) return;
            const signature = JSON.stringify(payload);
            if (this.draft?.signature !== signature) this.draft = { signature, nonce: crypto.randomUUID() };
            this.sending = true; this.sendButton.disabled = true;
            try {
                await this.command({ ...payload, nonce: this.draft.nonce });
                this.input.value = ''; this.draft = null;
            } catch { /* Le texte et le nonce restent disponibles pour réessayer sans doublon. */ }
            finally { this.sending = false; this.sendButton.disabled = false; }
        }, { signal });
        for (const [button, action] of [['invite', 'invite'], ['leave', 'leave'], ['accept', 'answer'], ['decline', 'answer']]) {
            byId(button).addEventListener('click', event => {
                const control = event.currentTarget; control.disabled = true;
                void this.command({ action, target: this.target.value, accept: button === 'accept', invitation: this.invitationId, party: this.partyId })
                    .catch(() => {}).finally(() => { control.disabled = false; });
            }, { signal });
        }
        this.timer = setInterval(() => { if (!this.busy) void this.command({ action: 'poll' }).catch(() => {}); }, 1500);
        void this.command({ action: 'poll' }).catch(() => {});
        scene.events.once('shutdown', () => { clearInterval(this.timer); this.events.abort(); this.request?.abort(); this.stopped = true; });
    }

    command(payload) {
        // Une seule requête à la fois évite qu'un ancien sondage remplace le groupe après une action.
        const task = (this.queue ?? Promise.resolve()).then(async () => {
            if (this.stopped) return;
            this.busy = true;
            const controller = new AbortController(); this.request = controller;
            const timeout = setTimeout(() => controller.abort(), 6000);
            try {
                const response = await fetch(this.rules.chatUrl, { method: 'POST', credentials: 'same-origin', signal: controller.signal,
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ ...payload, after: this.cursor, _token: this.rules.progressToken }) });
                if (response.redirected) throw new Error('Session expirée. Recharge le jeu.');
                const result = await response.json().catch(() => ({ error: 'Tchat indisponible. Réessaie dans un instant.' }));
                if (!response.ok || !Array.isArray(result.messages)) throw new Error(result.error ?? 'Tchat indisponible.');
                if (this.stopped) return;
                this.render(result);
                if (payload.action !== 'poll' || performance.now() >= (this.statusUntil ?? 0)) {
                    const message = payload.action === 'invite' ? 'Invitation envoyée (2 min pour répondre).' : 'Connecté · Entrée pour écrire · Échap pour jouer';
                    if (this.status.textContent !== message) this.status.textContent = message;
                }
            } catch (error) {
                if (!this.stopped) {
                    const message = error.name === 'AbortError' || error instanceof TypeError ? 'Connexion au tchat interrompue. Réessai automatique…' : error.message;
                    if (this.status.textContent !== message) this.status.textContent = message;
                    if (payload.action !== 'poll') this.statusUntil = performance.now() + 6000;
                }
                throw error;
            } finally { clearTimeout(timeout); this.busy = false; }
        });
        this.queue = task.catch(() => {});
        return task;
    }

    render(snapshot) {
        for (const message of snapshot.messages) {
            if (this.seen.has(message.id)) continue;
            this.seen.add(message.id); appendChatMessage(this.log, message);
            if (!this.root.open) this.unread++;
        }
        this.cursor = Math.max(this.cursor, snapshot.cursor);
        // Le DOM et l'anti-doublon restent bornés pendant une longue session.
        if (this.seen.size > 400) this.seen = new Set([...this.seen].slice(-200));
        document.getElementById('chat-count').textContent = this.unread ? `(${this.unread})` : '';
        const party = snapshot.party;
        this.partyId = party?.id;
        this.invitationId = snapshot.invitation ? Number(snapshot.invitation.id) : null;
        document.getElementById('chat-party').textContent = party
            ? `Groupe (${party.members.length}/5) : ` + party.members.map(member => member.name + (Number(member.id) === party.leader ? ' ★' : '')).join(', ')
            : 'Aucun groupe · invite un personnage pour en créer un.';
        const leave = document.getElementById('chat-leave');
        leave.hidden = !party;
        leave.textContent = party?.leader === this.rules.characterId ? 'Dissoudre le groupe' : 'Quitter le groupe';
        document.getElementById('chat-invite').disabled = !!party && party.leader !== this.rules.characterId;
        document.getElementById('chat-invitation').hidden = !snapshot.invitation;
        document.getElementById('chat-invitation-text').textContent = snapshot.invitation ? `${snapshot.invitation.name} t’invite dans son groupe.` : '';
        const online = document.getElementById('chat-online');
        const signature = JSON.stringify(snapshot.online);
        if (signature !== this.onlineSignature) {
            online.replaceChildren(...snapshot.online.map(player => {
                const option = document.createElement('option'); option.value = `${player.name} #${player.id}`; return option;
            }));
            this.onlineSignature = signature;
        }
    }
}
