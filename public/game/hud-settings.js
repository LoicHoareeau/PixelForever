export function normalizeHudSettings(saved, slots) {
    const order = saved?.order;
    const validOrder = Array.isArray(order) && order.length === slots.length
        && new Set(order).size === slots.length && order.every(id => slots.includes(id));
    const positions = {};
    for (const name of ['player', 'target', 'quick', 'actions', 'chat', 'quest', 'feedback']) {
        const point = saved?.positions?.[name];
        if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
            positions[name] = { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) };
        }
    }
    return {
        scale: Number.isFinite(saved?.scale) ? Math.max(.7, Math.min(1.3, saved.scale)) : 1,
        opacity: Number.isFinite(saved?.opacity) ? Math.max(.7, Math.min(1, saved.opacity)) : .91,
        positions,
        order: validOrder ? [...order] : [...slots],
    };
}

export function swapHudSlots(order, source, target) {
    const a = order.indexOf(source), b = order.indexOf(target);
    if (a < 0 || b < 0) return [...order];
    const swapped = [...order];
    [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
    return swapped;
}

export function fitHudPoint(point, width, height, viewportWidth, viewportHeight) {
    return {
        x: Math.max(4, Math.min(Math.max(4, viewportWidth - width - 4), point.x)),
        y: Math.max(24, Math.min(Math.max(24, viewportHeight - height - 4), point.y)),
    };
}

export function defaultHudLayout(width, height, sizes, scale) {
    const size = name => {
        const block = sizes[name];
        const zoom = Math.min(scale, (width - 12) / block.width);
        return { width: block.width * zoom, height: block.height * zoom };
    };
    const player = size('player'), target = size('target'), quick = size('quick');
    const actions = size('actions'), feedback = size('feedback'), chat = size('chat');
    const positions = { player: { x: 14, y: 24 }, target: { x: width * .4, y: 24 } };
    if (player.width + target.width + 44 <= width) {
        positions.target.x = Math.max(player.width + 30, positions.target.x);
    } else {
        positions.target = { x: 14, y: player.height + 40 };
    }
    positions.quick = { x: width - quick.width - 14, y: 24 };
    if (positions.target.x + target.width + quick.width + 30 > width) {
        positions.quick.y = Math.max(24 + player.height, positions.target.y + target.height) + 16;
    }
    positions.quest = { x: width - size('quest').width - 14, y: Math.max(150, positions.quick.y + quick.height + 20) };
    positions.actions = { x: (width - actions.width) / 2, y: height - actions.height - 12 };
    positions.feedback = { x: (width - feedback.width) / 2, y: positions.actions.y - feedback.height - 18 };
    positions.chat = { x: 14, y: positions.actions.y - chat.height - 18 };
    return positions;
}
