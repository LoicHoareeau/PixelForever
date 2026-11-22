// Headless only. Two isolated sessions use the exported PHP fixture and a local presence transport.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
    assert(process.env.PIXEL_HUNTER_HTML, 'Export PIXEL_HUNTER_HTML via tests/account_flow.php.');
    const html = await fs.readFile(process.env.PIXEL_HUNTER_HTML, 'utf8');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PIXEL_BROWSER_PATH || undefined });
    const publicRoot = path.resolve(__dirname, '../public'), states = new Map(), errors = [], pages = [];
    try {
        for (const id of [1, 2]) {
            const context = await browser.newContext({ viewport: { width:1280, height:800 } });
            const page = await context.newPage(); pages.push(page);
            page.on('pageerror', e => errors.push(e.message));
            page.on('console', message => { if (['error', 'warning'].includes(message.type())) console.log(message.text()); });
            await page.addInitScript(() => {
                Object.defineProperty(window, 'Phaser', { configurable:true, set(value) {
                    Object.defineProperty(window, 'Phaser', { configurable:true, writable:true, value });
                    value.Game = new Proxy(value.Game, { construct(target, args) {
                        const game = Reflect.construct(target, args); window.__hunterGame = game; return game;
                    } });
                } });
            });
            await page.route('https://pixel.test/**', async route => {
                const req = route.request(), url = new URL(req.url());
                if (url.pathname === '/') return route.fulfill({ contentType:'text/html', body:html });
                if (req.method() === 'POST') {
                    const data = req.postDataJSON(), now = Date.now();
                    if (data.state) {
                        states.set(id, { ...data.state, id, name:'Arden '+id, skin:'hunter', level:1, updatedAt:now,
                            actions:data.state.actions.map(a => [a[0], now-a[1], ...a.slice(2)]) });
                        return route.fulfill({ json:{ serverTime:now, onlineCount:states.size, players:[...states.values()].filter(s=>s.id!==id) } });
                    }
                    if (url.pathname.includes('flux') || url.pathname.includes('stream')) return route.fulfill({ status:503, json:{error:'HTTP fallback test'} });
                    return route.fulfill({ json:{ success:true } });
                }
                if (url.pathname.includes('tchat')) return route.fulfill({ json:{messages:[],group:null} });
                const file = path.resolve(publicRoot, '.'+decodeURIComponent(url.pathname));
                if (!file.startsWith(publicRoot+path.sep)) return route.abort();
                try {
                    const type = {'.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'}[path.extname(file)];
                    await route.fulfill({ contentType:type, body:await fs.readFile(file) });
                } catch { await route.fulfill({status:404,body:'Not found'}); }
            });
            await page.goto('https://pixel.test/');
            await page.waitForFunction(()=>window.__hunterGame?.scene.getScenes(true)[0]?.hunterArtReady, null, {timeout:30000}).catch(async e=>{
                console.log('Startup:',errors,await page.evaluate(()=>({status:document.getElementById('game-status')?.textContent,phaser:!!window.Phaser,game:!!window.__hunterGame})));
                throw e;
            });
            const guide = page.locator('#game-guide');
            if (await guide.evaluate(element=>element.open)) await guide.locator('form button').click();
        }
        for (const page of pages) await page.waitForFunction(()=>window.__hunterGame.scene.getScenes(true)[0].presence.players.size===1, null, {timeout:10000});
        const result = await pages[0].evaluate(async () => {
            const s = window.__hunterGame.scene.getScenes(true)[0]; s.scene.pause();
            const directions=['east','south-east','south','south-west','west','north-west','north','north-east'];
            const result=[];
            for (const facing of directions) {
                s.facing=facing; const textures=new Set(), steps=new Set();
                for(let n=0;n<8;n++) {
                    s.combat.attackVisual=null;s.walkDistance=n*7;s.lastWalkAt=100;s.renderAvatar(100);
                    steps.add(s.avatar.frame.name); textures.add(s.avatar.texture.key);
                }
                const movingShots=new Set();
                for(let n=0;n<8;n++) {
                    const now=1000+n*20;
                    s.walkDistance=n*7;s.lastWalkAt=now;
                    s.combat.attackVisual={facing,weaponStyle:'bow',ranged:true,start:1000,castMs:180,end:330+1000};
                    s.renderAvatar(now);movingShots.add(s.avatar.frame.name);
                }
                const shots=new Set();s.lastWalkAt=-Infinity;
                for(let n=0;n<9;n++) {
                    s.combat.attackVisual={facing,weaponStyle:'bow',ranged:true,start:0,castMs:180,end:330};
                    s.renderAvatar(n<4?n*45:180+(n-4)*42);
                    shots.add(s.avatar.frame.name);
                }
                result.push({facing,steps:steps.size,movingShots:[...movingShots],shots:shots.size,textures:[...textures],flip:s.avatar.flipX,scale:s.avatar.scaleX,
                    foot:s.avatar.y,origin:s.avatar.originY});
            }
            s.combat.attackVisual=null;s.lastWalkAt=-Infinity;s.facing='south-east';s.renderAvatar(1000);
            const remote=s.presence.players.values().next().value;
            return {poses:result,skin:s.skin,failed:s.load.totalFailed,remoteTexture:remote.sprite.texture.key,
                maxTexture: s.game.renderer.gl?.getParameter(s.game.renderer.gl.MAX_TEXTURE_SIZE)};
        });
        assert.equal(result.skin,'hunter'); assert.equal(result.failed,0);
        for(const pose of result.poses) {
            assert.equal(pose.steps,8);assert.equal(pose.shots,8);assert.equal(pose.flip,false);assert.equal(pose.origin,1);
            assert.deepEqual(pose.movingShots,Array.from({length:8},(_,i)=>'walk-'+i));
            assert(pose.textures.every(t=>t.startsWith('hunter-v2-')));assert(pose.scale>0&&pose.scale<1);
        }
        assert(result.remoteTexture.startsWith('hunter-v2-'));
        await pages[0].screenshot({path:process.env.PIXEL_HUNTER_SCREENSHOT||process.env.PIXEL_HUNTER_HTML+'.png'});
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({result,errors,twoSessions:true},null,2));
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
