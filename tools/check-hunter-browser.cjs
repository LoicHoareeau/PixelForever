// Headless only. Two isolated sessions use the exported PHP fixture and a local presence transport.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
    const skin=process.env.PIXEL_CHARACTER||'hunter';
    const checkClearing=process.env.PIXEL_CLEARING_CHECK==='1';
    assert(['hunter','rogue'].includes(skin));
    const fixture=process.env['PIXEL_'+skin.toUpperCase()+'_HTML'];
    assert(fixture, 'Export the character fixture via tests/account_flow.php.');
    const html = await fs.readFile(fixture, 'utf8');
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
                        states.set(id, { ...data.state, id, name:skin+' '+id, skin, level:1, updatedAt:now,
                            actions:data.state.actions.map(a => [a[0], now-a[1], ...a.slice(2)]) });
                        return route.fulfill({ json:{ serverTime:now, onlineCount:states.size, players:[...states.values()].filter(s=>s.id!==id) } });
                    }
                    if (url.pathname.endsWith('/temps-reel')) return route.fulfill({ status:503, json:{error:'HTTP fallback test'} });
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
            if(skin==='rogue') {
                assert((await page.locator('.hud-portrait').getAttribute('src')).includes('rogue-v2/portrait.webp'));
                await page.waitForFunction(()=>document.querySelector('.hud-portrait').naturalWidth>0);
            }
        }
        for (const page of pages) await page.waitForFunction(()=>window.__hunterGame.scene.getScenes(true)[0].presence.players.size===1, null, {timeout:10000});
        const result = await pages[0].evaluate(async ({skin,checkClearing}) => {
            const s = window.__hunterGame.scene.getScenes(true)[0]; s.scene.pause();
            window.__mapTestScene=s;
            const windup=skin==='hunter'?180:140, weaponStyle=skin==='hunter'?'bow':'daggers';
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
                    s.combat.attackVisual={facing,weaponStyle,ranged:skin==='hunter',start:1000,castMs:windup,end:windup+1000};
                    s.renderAvatar(now);movingShots.add(s.avatar.frame.name);
                }
                const shots=new Set();s.lastWalkAt=-Infinity;
                for(let n=0;n<9;n++) {
                    s.combat.attackVisual={facing,weaponStyle,ranged:skin==='hunter',start:0,castMs:windup,end:windup};
                    s.renderAvatar(n<4?n*windup/4:windup+(n-4)*42);
                    shots.add(s.avatar.frame.name);
                }
                result.push({facing,steps:steps.size,movingShots:[...movingShots],shots:shots.size,textures:[...textures],flip:s.avatar.flipX,scale:s.avatar.scaleX,
                    foot:s.avatar.y,origin:s.avatar.originY});
            }
            s.combat.attackVisual=null;s.lastWalkAt=-Infinity;s.facing='south-east';s.renderAvatar(1000);
            const vfx=[];
            if(skin==='rogue') for(const progress of [0,.26,.51,.99]) {
                s.combat.vfx.begin();
                ['rogue-slash','rogue-flurry','rogue-venom','rogue-shadow'].forEach((kind,i)=>
                    s.combat.vfx.play(kind,s.position.x+(i-1.5)*24,s.position.y-18,progress,.3));
                vfx.push(s.combat.vfx.images().map(image=>({texture:image.texture.key,frame:Number(image.frame.name)})));
            }
            const remote=s.presence.players.values().next().value;
            let clearing=null;
            if(checkClearing){
                const {clearingTrail,clearingGlades,clearingScenery}=await import('/game/clearing-layout.js');
                const [firstX,firstY]=clearingTrail[0];s.position.set((firstX+.5)*16,(firstY+.5)*16);
                let blocked=0,steps=0;
                for(const [tx,ty] of clearingTrail.slice(1)){
                    const target={x:(tx+.5)*16,y:(ty+.5)*16};
                    while(Math.hypot(target.x-s.position.x,target.y-s.position.y)>.1&&steps<2500){
                        const dx=target.x-s.position.x,dy=target.y-s.position.y,d=Math.hypot(dx,dy),length=Math.min(2,d);
                        const old={x:s.position.x,y:s.position.y};s.move(dx/d*length,dy/d*length,s.time.now);steps++;
                        if(Math.hypot(s.position.x-old.x,s.position.y-old.y)<.1){blocked++;break;}
                    }
                }
                clearing={blocked,steps,glades:clearingGlades.map(([x,y])=>s.canStand((x+.5)*16,(y+.5)*16)),
                    obstacles:clearingScenery().filter(p=>p.collision).map(p=>!s.canStand(p.x,p.y)),
                    atlas:s.textures.get('clearing-props-v2').getFrameNames().length};
                const boar=s.combat.monsters.find(monster=>monster.species==='boar');
                const oldFacing=boar.facing;const frames=new Set();
                for(let direction=0;direction<8;direction++){
                    boar.facing=direction;
                    for(let phase=0;phase<36;phase++){
                        boar.walkDistance=(phase+.1)*boar.art.stride/36;boar.renderPose(0,true);
                        frames.add(boar.sprite.frame.name);
                    }
                }
                boar.facing=oldFacing;boar.renderPose(0,false);
                s.combat.selectMonster(boar);
                clearing.boar={frames:frames.size,portrait:boar.portraitArt,texture:boar.sprite.texture.key};
                const {summonFamiliar}=await import('/game/class-combat.js');
                const captured=s.combat.progress.capturedPet;
                s.combat.progress.capturedPet={species:'boar',healthFraction:1};
                summonFamiliar(s.combat,'beast',0);
                clearing.boar.petTexture=s.combat.familiar.actor.texture.key;
                s.combat.familiar.recalled=true;s.combat.progress.capturedPet=captured;
            }
            return {poses:result,vfx,clearing,skin:s.skin,failed:s.load.totalFailed,remoteTexture:remote.sprite.texture.key,
                maxTexture: s.game.renderer.gl?.getParameter(s.game.renderer.gl.MAX_TEXTURE_SIZE)};
        },{skin,checkClearing});
        assert.equal(result.skin,skin); assert.equal(result.failed,0);
        for(const pose of result.poses) {
            assert.equal(pose.steps,8);assert.equal(pose.shots,8);assert.equal(pose.flip,false);assert.equal(pose.origin,1);
            assert.deepEqual(pose.movingShots,Array.from({length:8},(_,i)=>'walk-'+i));
            assert(pose.textures.every(t=>t.startsWith(skin+'-v2-')));assert(pose.scale>0&&pose.scale<1);
        }
        assert(result.remoteTexture.startsWith(skin+'-v2-'));
        if(skin==='rogue') for(const [phase,effects] of result.vfx.entries()) {
            assert.equal(effects.length,4);
            effects.forEach((effect,row)=>{assert.equal(effect.texture,'rogue-vfx');assert.equal(effect.frame,row*4+phase);});
        }
        if(checkClearing){
            assert.equal(result.clearing.blocked,0);assert(result.clearing.steps>200&&result.clearing.steps<2500);
            assert(result.clearing.glades.every(Boolean));assert(result.clearing.obstacles.every(Boolean));assert.equal(result.clearing.atlas,8);
            assert.deepEqual(result.clearing.boar,{frames:288,portrait:'boar-v2',texture:'boar-motion',petTexture:'boar-motion'});
            for(const [label,x,y] of [['clairiere',400,430],['clairiere-lumiere',620,500],['clairiere-falaises',448,880]]){
                await pages[0].evaluate(({x,y})=>{
                    const s=window.__mapTestScene;s.scene.resume();s.position.set(x,y);s.cameras.main.centerOn(x,y);
                    const pet=s.combat.familiar;if(pet){pet.x=x-22;pet.y=y+8;pet.actor.setPosition(pet.x,pet.y);}
                },{x,y});
                await pages[0].waitForTimeout(400);
                await pages[0].screenshot({path:require('node:path').join(require('node:path').dirname(fixture),label+'.png')});
            }
        }
        await pages[0].screenshot({path:process.env.PIXEL_HUNTER_SCREENSHOT||fixture+'.png'});
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({result,errors,twoSessions:true},null,2));
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
