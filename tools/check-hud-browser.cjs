// Vérification facultative hors écran : Playwright doit être disponible dans NODE_PATH.
const { chromium } = require('playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

(async () => {
    assert.ok(process.env.PIXEL_HUD_HTML, 'Définir PIXEL_HUD_HTML sur le rendu exporté par tests/account_flow.php.');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PIXEL_BROWSER_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1920, height: 960 } });
    await page.addInitScript(() => {
        Object.defineProperty(window, 'Phaser', { configurable: true, set(value) {
            Object.defineProperty(window, 'Phaser', { configurable: true, writable: true, value });
            value.Game = new Proxy(value.Game, { construct(target, args) {
                const game = Reflect.construct(target, args);
                window.__hudTestGame = game;
                return game;
            } });
        } });
    });
    const errors = [];
    const unversioned = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/game/') && url.pathname.endsWith('.js') && !url.pathname.includes('phaser-') && !url.searchParams.has('v')) unversioned.add(url.pathname);
    });
    const publicRoot = path.resolve(__dirname, '../public');
    await page.route('http://pixel.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') {
            let html = await readFile(process.env.PIXEL_HUD_HTML, 'utf8');
            html = html.replace(/data-combat="([^"]*)"/, (_, value) => {
                const decoded = value.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#([0-9]+);/g, (_, n) => String.fromCodePoint(Number(n))).replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&amp;', '&');
                const rules = JSON.parse(decoded);
                delete rules.worldUrl;
                rules.chatUrl = '/__chat'; rules.progressUrl = '/__progress';
                return 'data-combat="' + JSON.stringify(rules).replaceAll('&', '&amp;').replaceAll('"', '&quot;') + '"';
            });
            await route.fulfill({ contentType: 'text/html', body: html }); return;
        }
        if (url.pathname === '/__chat') {
            await route.fulfill({ json: { messages: [], party: null, invitation: null, online: [], cursor: 0 } }); return;
        }
        if (url.pathname === '/__progress') {
            await route.fulfill({ json: route.request().postDataJSON() }); return;
        }
        const file = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(publicRoot + path.sep)) { await route.abort(); return; }
        try {
            if (url.pathname === '/game/world.js' && !url.search && process.env.PIXEL_HUD_STALE_WORLD) {
                // Version publiée juste avant l’ATH personnalisable : simule un ancien cache HTTP frais.
                const ref = process.env.PIXEL_HUD_STALE_REF || 'c1aef2d28eb22ecb6663a36a461da578a11a61e9';
                const body = execFileSync('git', ['show', ref + ':public/game/world.js'], { cwd: path.dirname(publicRoot), encoding: 'utf8' });
                await route.fulfill({ contentType: 'text/javascript', body }); return;
            }
            const extension = path.extname(file);
            const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[extension];
            await route.fulfill({ body: await readFile(file), contentType });
        } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
    });
    try {
        await page.goto('http://pixel.test/');
        await page.waitForFunction(() => window.__hudTestGame?.scene.getScenes(true)[0]?.combat, { timeout: 15000 });
        console.log('Runtime errors:', JSON.stringify(errors));
        const state = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-hud-block]')].map(element => {
            const r = element.getBoundingClientRect();
            return [element.dataset.hudBlock, { left: element.style.left, top: element.style.top, rect: [r.x, r.y, r.width, r.height] }];
        })));
        console.log('HUD state:', JSON.stringify(state));
        if (process.env.PIXEL_HUD_SCREENSHOT) await page.screenshot({ path: process.env.PIXEL_HUD_SCREENSHOT });
        assert.deepEqual(errors, [], 'Aucune erreur de démarrage ne doit interrompre la construction de l’ATH.');
        assert.ok(state.player.left && state.quick.left, 'Les positions de l’ATH doivent être initialisées.');
        const p = state.player.rect, q = state.quick.rect;
        assert.ok(p[0] + p[2] <= q[0] || q[0] + q[2] <= p[0] || p[1] + p[3] <= q[1] || q[1] + q[3] <= p[1], 'Le menu rapide ne doit pas recouvrir la fiche joueur.');
        const icons = await page.locator('#inventory-open .action-icon').getAttribute('data-spell-icon');
        assert.equal(icons, 'menu_inventory', 'L’icône illustrée du sac doit être appliquée.');
        assert.deepEqual([...unversioned], [], 'Chaque module du graphe doit contourner les anciennes versions en cache.');
        const guide = page.locator('#game-guide');
        if (await guide.evaluate(element => element.open)) await guide.locator('form button').click();
        await page.locator('#game-menu-open').click();
        await page.locator('#game-options-open').click();
        await page.locator('#hud-scale').evaluate(element => { element.value = '130'; element.dispatchEvent(new Event('input', { bubbles: true })); });
        assert.equal(await page.locator('#hud-scale-value').textContent(), '130 %');
        await page.locator('#hud-edit-open').click();
        const source = await page.locator('[data-attack="special"]').boundingBox();
        const destination = await page.locator('[data-attack="talent-0"]').boundingBox();
        await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
        await page.mouse.down(); await page.waitForTimeout(400);
        await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 8 });
        await page.mouse.up();
        assert.equal(await page.locator('[data-attack="special"] kbd').textContent(), '3');
        await page.locator('#hud-save').click();
        await page.evaluate(() => {
            const scene = window.__hudTestGame.scene.getScenes(true)[0];
            scene.combat.attack = kind => { window.lastShortcut = kind; };
            scene.game.canvas.focus();
        });
        await page.keyboard.press('3');
        assert.equal(await page.evaluate(() => window.lastShortcut), 'special');
        await page.locator('[data-chat-channel="whisper"]').click();
        assert.equal(await page.locator('#chat-channel').inputValue(), 'whisper');
        await page.reload();
        await page.waitForFunction(() => window.__hudTestGame?.scene.getScenes(true)[0]?.combat, { timeout: 15000 });
        if (await guide.evaluate(element => element.open)) await guide.locator('form button').click();
        assert.equal(await page.locator('[data-attack="special"] kbd').textContent(), '3');
        await page.locator('#game-menu-open').click(); await page.locator('#game-options-open').click();
        assert.equal(await page.locator('#hud-scale-value').textContent(), '130 %');
        await page.locator('#hud-scale').evaluate(element => { element.value = '100'; element.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.locator('#game-menu form button').click();
        if (process.env.PIXEL_HUD_SCREENSHOT) await page.screenshot({ path: process.env.PIXEL_HUD_SCREENSHOT });
        assert.deepEqual(errors, []);
        console.log('Menu, taille, glissement, raccourci, tchat et restauration : OK');
    } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
