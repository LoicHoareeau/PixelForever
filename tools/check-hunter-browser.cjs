// Headless only. Two isolated sessions use the exported PHP fixture and a local presence transport.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
    const character=process.env.PIXEL_CHARACTER||'hunter',skin=character==='mage'?'noe':character;
    const checkClearing=process.env.PIXEL_CLEARING_CHECK==='1';
    assert(['hunter','rogue','mage'].includes(character));
    const fixture=process.env['PIXEL_'+character.toUpperCase()+'_HTML'];
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
            if(skin==='rogue'||character==='mage') {
                assert((await page.locator('.hud-portrait').getAttribute('src')).includes(character+'-v2/portrait.webp'));
                await page.waitForFunction(()=>document.querySelector('.hud-portrait').naturalWidth>0);
            }
        }
        for (const page of pages) await page.waitForFunction(()=>window.__hunterGame.scene.getScenes(true)[0].presence.players.size===1, null, {timeout:10000});
        if(character==='mage'){
            const previous=await pages[0].evaluate(()=>{const s=window.__hunterGame.scene.getScenes(true)[0];const p=s.combat.progress.weapon;s.combat.progress.weapon='rare';s.lastWalkAt=-Infinity;return p;});
            await pages[1].waitForFunction(()=>[...window.__hunterGame.scene.getScenes(true)[0].presence.players.values()]
                .some(player=>String(player.sprite.frame.name).startsWith('staff-')),null,{timeout:10000});
            await pages[0].evaluate(previous=>{window.__hunterGame.scene.getScenes(true)[0].combat.progress.weapon=previous;},previous);
        }
        const result = await pages[0].evaluate(async ({skin,character,checkClearing}) => {
            const s = window.__hunterGame.scene.getScenes(true)[0]; s.scene.pause();
            window.__mapTestScene=s;
            const windup=skin==='rogue'?140:180, weaponStyle=skin==='hunter'?'bow':character==='mage'?'wand':'daggers';
            const directions=['east','south-east','south','south-west','west','north-west','north','north-east'];
            const count=character==='mage'?16:8,walkStep=56/count,half=count/2;
            let anchorError=0;
            const checkedFeet=new Map();
            function checkFeet(){
                if(character!=='mage')return;
                const sprite=s.avatar,frame=sprite.frame,key=sprite.texture.key+':'+frame.name;
                let foot=checkedFeet.get(key);
                if(!foot){
                    const canvas=document.createElement('canvas');canvas.width=frame.cutWidth;canvas.height=frame.cutHeight;
                    const ctx=canvas.getContext('2d');ctx.drawImage(frame.source.image,frame.cutX,frame.cutY,frame.cutWidth,frame.cutHeight,0,0,canvas.width,canvas.height);
                    const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
                    let left=canvas.width,right=0;
                    for(let y=Math.floor(canvas.height*.88);y<canvas.height;y++)for(let x=0;x<canvas.width;x++)
                        if(data[(y*canvas.width+x)*4+3]>160){left=Math.min(left,x);right=Math.max(right,x);}
                    if(right<left)throw new Error('Boots missing in '+key);
                    foot=(left+right)/2;checkedFeet.set(key,foot);
                }
                anchorError=Math.max(anchorError,Math.abs((foot-sprite.originX*frame.cutWidth)*sprite.scaleX));
            }
            const result=[];
            for (const facing of directions) {
                s.facing=facing; const textures=new Set(), steps=new Set();
                for(let n=0;n<count;n++) {
                    s.combat.attackVisual=null;s.walkDistance=n*walkStep;s.lastWalkAt=100;s.renderAvatar(100);checkFeet();
                    steps.add(s.avatar.frame.name); textures.add(s.avatar.texture.key);
                }
                const movingShots=new Set();
                for(let n=0;n<count;n++) {
                    const now=1000+n*20;
                    s.walkDistance=n*walkStep;s.lastWalkAt=now;
                    s.combat.attackVisual={facing,weaponStyle,ranged:skin!=='rogue',start:1000,castMs:windup,end:windup+1000};
                    s.renderAvatar(now);checkFeet();movingShots.add(s.avatar.frame.name);
                }
                const shots=new Set();s.lastWalkAt=-Infinity;
                for(let n=0;n<(character==='mage'?16:9);n++) {
                    s.combat.attackVisual={facing,weaponStyle,ranged:skin!=='rogue',start:0,castMs:windup,end:windup};
                    s.renderAvatar(n<half?n*windup/half:windup+(n-half)*210/(character==='mage'?8:5));checkFeet();
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
            const staff=[];
            if(character==='mage'){
                const saved=s.combat.progress.weapon;s.combat.progress.weapon='rare';
                for(const facing of directions){
                    s.facing=facing;
                    for(const mode of ['walk','cast','strike']){
                        const frames=new Set();
                        for(let n=0;n<count;n++){
                            const now=n<half?n*windup/half:windup+(n-half)*210/half;
                            s.walkDistance=n*walkStep;s.lastWalkAt=mode==='walk'?now:-Infinity;
                            s.combat.attackVisual={facing,weaponStyle:'wand',ranged:mode!=='strike',start:0,castMs:windup,end:windup};
                            s.renderAvatar(now);checkFeet();frames.add(s.avatar.frame.name);
                        }
                        staff.push({facing,mode,frames:[...frames]});
                    }
                }
                s.combat.progress.weapon=saved;
                for(let phase=0;phase<6;phase++){
                    s.combat.vfx.begin();
                    ['mage-firebolt','mage-fire-wall','mage-fire-whirl','mage-arcane','mage-frost-nova','mage-ice-armor'].forEach((kind,i)=>
                        s.combat.vfx.play(kind,s.position.x+(i%3-1)*40,s.position.y-55+Math.floor(i/3)*30,(phase+.1)/6,.3));
                    vfx.push(s.combat.vfx.images().map(image=>({texture:image.texture.key,frame:Number(image.frame.name)})));
                }
                s.combat.attackVisual=null;s.facing='south-east';s.lastWalkAt=-Infinity;s.renderAvatar(1000);
            }
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
            return {poses:result,vfx,staff,anchorError,clearing,skin:s.skin,failed:s.load.totalFailed,remoteTexture:remote.sprite.texture.key,
                maxTexture: s.game.renderer.gl?.getParameter(s.game.renderer.gl.MAX_TEXTURE_SIZE)};
        },{skin,character,checkClearing});
        assert.equal(result.skin,skin); assert.equal(result.failed,0);
        for(const pose of result.poses) {
            assert.equal(pose.steps,character==='mage'?16:8);assert.equal(pose.shots,character==='mage'?16:8);assert.equal(pose.flip,false);assert.equal(pose.origin,1);
            assert.deepEqual(pose.movingShots,Array.from({length:character==='mage'?16:8},(_,i)=>'walk-'+i));
            assert(pose.textures.every(t=>t.startsWith(character+'-v2-')));assert(pose.scale>0&&pose.scale<1);
        }
        assert(result.remoteTexture.startsWith(character+'-v2-'));
        if(character==='mage'){
            assert(result.anchorError<.5,'Les pieds glissent par rapport à la position du joueur');
            assert.equal(result.staff.length,24);
            for(const pose of result.staff){
                const prefix=pose.mode==='walk'?'staff-walk-':pose.mode==='cast'?'staff-cast-':'staff-strike-';
                assert.deepEqual(pose.frames,Array.from({length:16},(_,n)=>prefix+n));
            }
            for(const [phase,effects] of result.vfx.entries()){
                assert.equal(effects.length,6);effects.forEach((fx,row)=>{assert.equal(fx.texture,'mage-vfx');assert.equal(fx.frame,row*6+phase);});
            }
            await pages[0].bringToFront();
            result.movement=await pages[0].evaluate(async()=>{
                const s=window.__mapTestScene;
                let start=null;
                for(let y=136;y<800&&!start;y+=16)for(let x=136;x<800&&!start;x+=16)
                    if(Array.from({length:121},(_,n)=>s.canStand(x+n*2,y)).every(Boolean))start={x,y};
                if(!start)throw new Error('No clear movement corridor');
                s.position.set(start.x,start.y);s.combat.attackVisual=null;s.walkDistance=0;
                s.scene.resume();s.heldKeys.add('ArrowRight');
                const intervals=[],steps=[],frames=new Set();let previousTime=null,previousX=start.x,startedAt=null;
                await new Promise(resolve=>{
                    function sample(time){
                        startedAt??=time;
                        if(previousTime!==null){intervals.push(time-previousTime);steps.push(s.position.x-previousX);}
                        previousTime=time;previousX=s.position.x;frames.add(s.avatar.frame.name);
                        if(time-startedAt<1000&&intervals.length<360)requestAnimationFrame(sample);else resolve();
                    }
                    requestAnimationFrame(sample);
                });
                s.heldKeys.clear();s.scene.pause();
                const sorted=[...intervals].sort((a,b)=>a-b);
                return {meanMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,p95Ms:sorted[Math.floor(sorted.length*.95)],
                    maxStep:Math.max(...steps),distance:s.position.x-start.x,frames:frames.size};
            });
            assert(result.movement.maxStep<=4.1,'déplacement réel anormal');
            assert(result.movement.distance>56);assert.equal(result.movement.frames,16);
        }
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
