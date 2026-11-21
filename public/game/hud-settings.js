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
