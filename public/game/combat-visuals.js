// Reproduire uniquement les images et les tracés déjà dessinés, sans exécuter de règle de combat distante.
const graphicsMethods = { fillStyle: 2, lineStyle: 3, fillRect: 4, strokeRect: 4, fillEllipse: 5,
    strokeEllipse: 5, fillCircle: 3, strokeCircle: 3, lineBetween: 4, beginPath: 0, closePath: 0,
    moveTo: 2, lineTo: 2, arc: 6, fillPath: 0, strokePath: 0 };
const textures = /^(?:boar|skeleton|dragon|imp|hound|fiend|breach_lord)-motion$|^malakor-(?:rage|actions|rage-actions)$|^(?:class-familiars|class-vfx|combat-vfx|hunter-vfx|rogue-vfx|mage-vfx)$/;
const finite = n => typeof n === 'number' && Number.isFinite(n);

function validCommand(c) {
    if (!Array.isArray(c) || !Object.hasOwn(graphicsMethods, c[0])) return false;
    const [method, ...args] = c;
    const max = graphicsMethods[method];
    const min = method.endsWith('Style') ? 1 : method.endsWith('Ellipse') ? 4 : method === 'arc' ? 5 : max;
    if (args.length < min || args.length > max) return false;
    if (method === 'arc' && (Math.abs(args[3]) > Math.PI * 4 || Math.abs(args[4]) > Math.PI * 4)) return false;
    return args.every((n, i) => {
        if (method === 'arc' && i === 5) return typeof n === 'boolean';
        if (!finite(n)) return false;
        if ((method === 'fillStyle' && i === 0) || (method === 'lineStyle' && i === 1)) return Number.isInteger(n) && n >= 0 && n <= 0xffffff;
        if ((method === 'fillStyle' && i === 1) || (method === 'lineStyle' && i === 2)) return n >= 0 && n <= 1;
        if (method === 'lineStyle' && i === 0) return n >= 0 && n <= 512;
        if (method.endsWith('Ellipse') && i === 4) return Number.isInteger(n) && n >= 3 && n <= 64;
        return Math.abs(n) <= 8192;
    });
}

export function validVisuals(value) {
    return value && Array.isArray(value.sprites) && value.sprites.length <= 120
        && value.sprites.every(s => s && typeof s.id === 'string' && /^[a-z0-9-]{1,24}$/.test(s.id)
            && typeof s.texture === 'string' && textures.test(s.texture)
            && Number.isInteger(s.frame) && s.frame >= 0 && s.frame < 2048
            && [s.x, s.y, s.rotation, s.scaleX, s.scaleY, s.originY, s.alpha, s.depth].every(finite)
            && s.x >= -256 && s.x <= 4352 && s.y >= -256 && s.y <= 4288
            && Math.abs(s.rotation) <= 100 && Math.abs(s.scaleX) <= 32 && Math.abs(s.scaleY) <= 32
            && s.originY >= 0 && s.originY <= 1 && s.alpha >= 0 && s.alpha <= 1 && Math.abs(s.depth) <= 10000
            && Number.isInteger(s.tint) && s.tint >= 0 && s.tint <= 0xffffff
            && (s.label === undefined || typeof s.label === 'string' && s.label.length <= 80 && finite(s.health))
            && (s.health === undefined || finite(s.health) && s.health >= 0 && s.health <= 1))
        && Array.isArray(value.graphics) && value.graphics.length === 2
        && value.graphics.every(layer => Array.isArray(layer) && layer.length <= 2048
            && layer.filter(c => Array.isArray(c) && c[0] === 'arc').length <= 32
            && layer.every(validCommand));
}

export function interpolateVisuals(a, b, fraction) {
    if (!a || !b) return a;
    const next = new Map(b.sprites.map(s => [s.id, s]));
    return { ...a, sprites: a.sprites.map(s => {
        const end = next.get(s.id);
        if (!end || s.texture !== end.texture || Math.hypot(end.x - s.x, end.y - s.y) > 160) return s;
        const t = Math.max(0, Math.min(1, fraction));
        return { ...s, x: s.x + (end.x - s.x) * t, y: s.y + (end.y - s.y) * t };
    }) };
}

export function recordGraphics(graphics) {
    const commands = [], originals = {};
    if (!graphics) return { snapshot: () => [], restore() {} };
    for (const method of ['clear', ...Object.keys(graphicsMethods)]) {
        if (typeof graphics[method] !== 'function') continue;
        originals[method] = graphics[method];
        graphics[method] = function (...args) {
            if (method === 'clear') commands.length = 0;
            else if (commands.length < 2048) commands.push([method, ...args]);
            return originals[method].apply(this, args);
        };
    }
    return { snapshot: () => commands.map(c => [...c]), restore: () => Object.assign(graphics, originals) };
}

function imageState(sprite, id) {
    return { id, texture: sprite.texture.key, frame: Number(sprite.frame.name), x: sprite.x, y: sprite.y,
        rotation: sprite.rotation, scaleX: sprite.scaleX, scaleY: sprite.scaleY, originY: sprite.originY,
        alpha: sprite.alpha, tint: sprite.tintTopLeft, depth: sprite.depth };
}

export function captureVisuals(combat, recordings) {
    const sprites = [];
    for (const [index, monster] of (combat.monsters ?? []).entries()) {
        if (monster.sprite.visible && (monster.alert || monster.health < monster.maxHealth)) {
            sprites.push({ ...imageState(monster.sprite, 'monster-' + index), label: `${monster.name} N.${monster.level}`,
                health: Math.max(0, Math.min(1, monster.health / monster.maxHealth)) });
        }
    }
    if (combat.familiar?.actor.visible) sprites.push(imageState(combat.familiar.actor, 'pet'));
    for (const [index, sprite] of (combat.vfx?.images?.() ?? []).entries()) sprites.push(imageState(sprite, 'fx-' + index));
    return { sprites: sprites.slice(0, 120), graphics: recordings.map(r => r.snapshot()) };
}

export class CombatVisuals {
    constructor(scene) {
        this.scene = scene;
        this.sprites = new Map();
        const depth = scene.terrain.length * 16 + 1;
        this.layers = [scene.add.graphics().setDepth(depth), scene.add.graphics().setDepth(depth - .36)];
    }

    render(visuals, owner) {
        const seen = new Set();
        for (const s of visuals?.sprites ?? []) {
            if (!this.scene.textures.exists(s.texture) || !this.scene.textures.get(s.texture).has(s.frame)) continue;
            seen.add(s.id);
            let view = this.sprites.get(s.id);
            if (!view) {
                view = { sprite: this.scene.add.image(s.x, s.y, s.texture, s.frame) };
                if (s.label) {
                    view.label = this.scene.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '8px',
                        color: '#a8e6dd', stroke: '#101719', strokeThickness: 2 }).setOrigin(.5, 1);
                    view.bar = this.scene.add.rectangle(0, 0, 24, 3, 0xd76c61).setOrigin(0, .5);
                }
                this.sprites.set(s.id, view);
            }
            if (view.sprite.texture.key !== s.texture || view.sprite.frame.name !== s.frame) view.sprite.setTexture(s.texture, s.frame);
            view.sprite.setOrigin(.5, s.originY).setPosition(s.x, s.y)
                .setScale(s.scaleX, s.scaleY).setRotation(s.rotation).setAlpha(s.alpha).setTint(s.tint).setDepth(s.depth);
            view.label?.setText(`${s.label} · ${owner}`).setPosition(s.x, s.y - 46).setDepth(s.y + 2);
            view.bar?.setPosition(s.x - 12, s.y - 43).setSize(24 * s.health, 3).setDepth(s.y + 1);
        }
        for (const [id, view] of this.sprites) if (!seen.has(id)) { this.remove(view); this.sprites.delete(id); }
        this.layers.forEach((layer, i) => {
            layer.clear();
            for (const [method, ...args] of visuals?.graphics?.[i] ?? []) layer[method](...args);
        });
    }

    remove(view) { view.sprite.destroy(); view.label?.destroy(); view.bar?.destroy(); }
    destroy() { for (const view of this.sprites.values()) this.remove(view); this.layers.forEach(layer => layer.destroy()); }
}
