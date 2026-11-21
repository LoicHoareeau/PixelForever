import { normalizeHudSettings, swapHudSlots, fitHudPoint } from './hud-settings.js';
import { setSpellIcon } from './spell-state.js';

export class HudControls {
    constructor(scene, { signal, releaseKeys, closeOthers, guide }) {
        this.scene = scene;
        this.releaseKeys = releaseKeys;
        this.menu = document.getElementById('game-menu');
        this.editor = document.getElementById('hud-editor');
        this.status = document.getElementById('hud-settings-status');
        this.blocks = [...document.querySelectorAll('[data-hud-block]')];
        this.slotRoot = document.querySelector('.action-slots');
        this.slots = [...this.slotRoot.querySelectorAll('[data-attack]')];
        this.ids = this.slots.map(button => button.dataset.attack);
        this.key = scene.combat.progressKey + ':hud';
        let saved;
        try { saved = JSON.parse(localStorage.getItem(this.key)); } catch { /* Le jeu reste utilisable sans stockage. */ }
        this.settings = normalizeHudSettings(saved, this.ids);
        for (const button of this.slots) {
            const cell = document.createElement('div');
            cell.className = 'action-cell';
            cell.dataset.slotId = button.dataset.attack;
            button.before(cell); cell.append(button);
        }
        this.cells = [...this.slotRoot.children];
        this.orderSlots();
        this.blocks.forEach(block => {
            const handle = document.createElement('button');
            handle.type = 'button'; handle.className = 'hud-drag-handle';
            handle.textContent = '⠿ ' + block.dataset.hudLabel;
            handle.setAttribute('aria-label', 'Déplacer : ' + block.dataset.hudLabel + '. Utilise aussi les flèches du clavier.');
            const summary = block.querySelector(':scope > summary');
            if (summary) summary.append(handle); else block.prepend(handle);
            handle.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); }, { signal });
            this.bindMove(block, handle, signal);
        });
        const on = (id, event, callback) => document.getElementById(id).addEventListener(event, callback, { signal });
        on('game-menu-open', 'click', () => this.openMenu(closeOthers));
        on('game-options-open', 'click', () => {
            document.getElementById('game-options').hidden = false;
            document.getElementById('game-options-open').setAttribute('aria-expanded', 'true');
        });
        on('hud-edit-open', 'click', () => this.startEdit());
        on('menu-guide-open', 'click', () => { this.menu.close(); closeOthers(guide); releaseKeys(); guide.showModal(); scene.tutorial?.record('guide'); });
        on('hud-save', 'click', () => this.endEdit(true));
        on('hud-cancel', 'click', () => this.endEdit(false));
        on('hud-reset', 'click', () => { this.settings = normalizeHudSettings(null, this.ids); this.orderSlots(); this.layout(true); });
        for (const id of ['hud-scale', 'hud-edit-scale']) on(id, 'input', event => {
            this.settings.scale = Number(event.target.value) / 100;
            this.layout(); if (!this.editing) this.save();
        });
        on('hud-opacity', 'input', event => {
            this.settings.opacity = Number(event.target.value) / 100;
            this.layout(); this.save();
        });
        this.menu.addEventListener('close', () => document.getElementById('game-menu-open').focus({ preventScroll: true }), { signal });
        window.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (document.querySelector('dialog[open]')) return;
            if (event.target?.closest?.('#game-chat')) return;
            event.preventDefault();
            this.cancelDrag();
            if (this.editing) this.endEdit(false); else this.openMenu(closeOthers);
        }, { signal });
        window.addEventListener('resize', () => this.layout(), { signal });
        this.resize = new ResizeObserver(() => this.layout());
        this.blocks.forEach(block => this.resize.observe(block));
        window.addEventListener('blur', () => this.cancelDrag(), { signal });
        this.slotRoot.addEventListener('pointerdown', event => this.holdSlot(event), { signal });
        this.slotRoot.addEventListener('pointermove', event => this.moveSlot(event), { signal });
        this.slotRoot.addEventListener('pointerup', event => this.dropSlot(event), { signal });
        for (const type of ['pointercancel', 'lostpointercapture']) this.slotRoot.addEventListener(type, () => this.cancelDrag(), { signal });
        this.slotRoot.addEventListener('click', event => {
            if (Date.now() < (this.suppressUntil ?? 0) || this.editing) {
                event.preventDefault(); event.stopImmediatePropagation();
                if (this.editing && event.detail === 0) this.keyboardSlot(event);
            }
        }, { capture: true, signal });
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.cancelDrag(); this.resize.disconnect(); document.body.classList.remove('hud-editing'); });
        setSpellIcon(document.getElementById('character-open').querySelector('.action-icon'), 'menu_profile');
        setSpellIcon(document.getElementById('talents-open').querySelector('.action-icon'), 'menu_talents');
        setSpellIcon(document.getElementById('inventory-open').querySelector('.action-icon'), 'menu_inventory');
        for (const button of scene.combat.potionButtons) setSpellIcon(button.querySelector('.action-icon'), 'potion_' + button.dataset.potion);
        if (window.innerWidth < 760) document.getElementById('game-chat').open = false;
        this.layout();
    }

    get blocksInput() { return this.editing || this.menu.open; }

    openMenu(closeOthers) {
        if (this.editing) this.endEdit(false);
        closeOthers(this.menu); this.releaseKeys(); this.cancelDrag();
        document.getElementById('game-options').hidden = true;
        document.getElementById('game-options-open').setAttribute('aria-expanded', 'false');
        this.menu.showModal();
    }

    startEdit() {
        this.backup = normalizeHudSettings(this.settings, this.ids);
        this.menu.close(); this.releaseKeys(); this.editing = true;
        document.body.classList.add('hud-editing'); this.editor.hidden = false;
        this.announce('Déplace les cadres par leur poignée. Au clavier, utilise les flèches. Pour les sorts, choisis la source puis la destination avec Entrée.');
        this.layout();
        document.getElementById('hud-edit-scale').focus();
    }

    endEdit(save) {
        this.cancelDrag(); this.armedSlot = null;
        if (!save) { this.settings = this.backup; this.orderSlots(); }
        this.editing = false; this.editor.hidden = true; document.body.classList.remove('hud-editing');
        this.scene.combat.cooldownUiNext = 0;
        this.scene.combat.updateCooldowns(this.scene.time.now);
        this.layout();
        const saved = !save || this.save();
        if (saved) this.announce(save ? 'Disposition enregistrée.' : 'Modifications annulées.');
        this.scene.game.canvas.focus({ preventScroll: true });
    }

    announce(text) { this.status.textContent = text; this.scene.combat.tell(text); }

    save() {
        try { localStorage.setItem(this.key, JSON.stringify(this.settings)); return true; }
        catch { this.announce('Le navigateur empêche la sauvegarde de l’ATH. Les réglages restent actifs pour cette partie.'); return false; }
    }

    orderSlots() {
        for (const id of this.settings.order) {
            const cell = this.cells.find(cell => cell.dataset.slotId === id);
            this.slotRoot.append(cell);
        }
        [...this.slotRoot.children].forEach((cell, index) => {
            const button = cell.querySelector('[data-attack]');
            button.querySelector('kbd').textContent = index + 1;
            button.setAttribute('aria-keyshortcuts', String(index + 1));
        });
    }

    attackForCode(code) {
        const match = /^Digit([1-9])$/.exec(code);
        return match ? this.settings.order[Number(match[1]) - 1] : undefined;
    }

    layout(reset = false) {
        const width = window.innerWidth, height = window.innerHeight;
        const defaults = {
            player: { x: 14, y: 16 }, target: { x: width * .4, y: 16 }, quick: { x: width - 360, y: 16 },
            actions: { x: width / 2 - 390, y: height - 120 }, chat: { x: 14, y: height - 420 },
            quest: { x: width - 290, y: 150 }, feedback: { x: width / 2 - 190, y: height - 200 },
        };
        if (width < 1100) { defaults.quick.y = 135; defaults.quest.y = 245; }
        if (width < 760) {
            defaults.target = { x: 12, y: 140 }; defaults.quick.y = 245; defaults.quest.y = 345;
            defaults.chat.y = height - 210;
        }
        for (const block of this.blocks) {
            const name = block.dataset.hudBlock;
            const scale = Math.min(this.settings.scale, (width - 12) / (block.offsetWidth || 300));
            block.style.setProperty('--hud-block-scale', String(scale));
            const point = !reset && this.settings.positions[name];
            const position = fitHudPoint(point ? { x: point.x * width, y: point.y * height } : defaults[name], (block.offsetWidth || 300) * scale, (block.offsetHeight || 90) * scale, width, height);
            block.style.left = position.x + 'px'; block.style.top = position.y + 'px';
            block.style.right = 'auto'; block.style.bottom = 'auto';
            block.style.transform = `scale(${scale})`;
        }
        document.body.style.setProperty('--hud-opacity', this.settings.opacity);
        for (const id of ['hud-scale', 'hud-edit-scale']) document.getElementById(id).value = this.settings.scale * 100;
        for (const id of ['hud-scale-value', 'hud-edit-scale-value']) document.getElementById(id).textContent = Math.round(this.settings.scale * 100) + ' %';
        document.getElementById('hud-opacity').value = this.settings.opacity * 100;
    }

    bindMove(block, handle, signal) {
        let drag;
        const place = (x, y) => {
            const rect = block.getBoundingClientRect();
            const point = fitHudPoint({ x, y }, rect.width, rect.height, window.innerWidth, window.innerHeight);
            this.settings.positions[block.dataset.hudBlock] = { x: point.x / window.innerWidth, y: point.y / window.innerHeight };
            block.style.left = point.x + 'px'; block.style.top = point.y + 'px';
        };
        handle.addEventListener('pointerdown', event => {
            if (!this.editing || event.button !== 0) return;
            event.preventDefault(); const rect = block.getBoundingClientRect();
            drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
            handle.setPointerCapture(event.pointerId);
        }, { signal });
        handle.addEventListener('pointermove', event => { if (drag && this.editing) place(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y); }, { signal });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(type, () => { drag = null; }, { signal });
        handle.addEventListener('keydown', event => {
            const delta = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
            if (!this.editing || !delta) return;
            event.preventDefault(); event.stopPropagation(); const rect = block.getBoundingClientRect(); place(rect.left + delta[0], rect.top + delta[1]);
        }, { signal });
    }

    holdSlot(event) {
        if (event.button !== 0) return;
        const cell = event.target.closest('.action-cell');
        const button = cell?.querySelector('[data-attack]');
        if (!button || button.hidden || button.dataset.unlocked === 'false') return;
        this.cancelDrag();
        this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, cell };
        cell.setPointerCapture(event.pointerId);
        this.holdTimer = setTimeout(() => {
            if (!this.pointer) return;
            this.dragSlot = cell.dataset.slotId; this.releaseKeys();
            this.ghost = button.cloneNode(true);
            this.ghost.removeAttribute('id');
            this.ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
            this.ghost.classList.add('hud-spell-ghost'); this.ghost.setAttribute('aria-hidden', 'true');
            document.body.append(this.ghost);
            cell.classList.add('slot-drag-source');
            this.positionGhost(this.pointer.x, this.pointer.y);
            this.suppressUntil = Date.now() + 1000;
        }, 350);
    }

    positionGhost(x, y) { if (this.ghost) { this.ghost.style.left = x - 28 + 'px'; this.ghost.style.top = y - 28 + 'px'; } }

    moveSlot(event) {
        if (!this.pointer || event.pointerId !== this.pointer.id) return;
        this.pointer.x = event.clientX; this.pointer.y = event.clientY;
        if (!this.dragSlot) return;
        event.preventDefault(); this.positionGhost(event.clientX, event.clientY);
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.action-cell');
        this.cells.forEach(cell => cell.classList.toggle('slot-drop-target', cell === target));
    }

    dropSlot(event) {
        if (this.dragSlot) {
            event.preventDefault();
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.action-cell');
            if (target && this.cells.includes(target)) this.swapSlots(this.dragSlot, target.dataset.slotId);
            this.suppressUntil = Date.now() + 300;
        }
        this.cancelDrag();
    }

    swapSlots(source, target) {
        this.settings.order = swapHudSlots(this.settings.order, source, target);
        this.orderSlots();
        if (this.editing || this.save()) this.announce('Sort déplacé : touche ' + (this.settings.order.indexOf(source) + 1) + '.');
    }

    keyboardSlot(event) {
        const id = event.target.closest('.action-cell')?.dataset.slotId;
        if (!id) return;
        if (this.armedSlot) { this.swapSlots(this.armedSlot, id); this.armedSlot = null; }
        else { this.armedSlot = id; this.announce('Choisis la case de destination puis appuie sur Entrée.'); }
    }

    cancelDrag() {
        clearTimeout(this.holdTimer); this.pointer = null; this.dragSlot = null;
        this.ghost?.remove(); this.ghost = null;
        this.cells?.forEach(cell => cell.classList.remove('slot-drag-source', 'slot-drop-target'));
    }
}
