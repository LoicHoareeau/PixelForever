// Asset packaging only: keep native pixels, alpha and every independently drawn direction.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const mageSpriteBounds=require('./mage-sprite-bounds.cjs');

(async () => {
    const sources = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const character = sources.character ?? 'hunter';
    const mageCount=character==='mage'?(sources.poseCount??8):8;
    assert(['hunter', 'rogue', 'mage'].includes(character));
    const action = character === 'mage' ? 'cast-' : character === 'rogue' ? 'strike-' : 'shot-';
    const root = path.resolve(__dirname, '../public/game');
    const out = path.join(root, 'val-des-saules/' + character + '-v2');
    fs.mkdirSync(out, { recursive: true });
    const textures = {}, poses = {};
    async function sheet(key, file, cols, rows, names, east = false) {
        const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const encoded = await sharp(file).webp({ lossless: true, effort: 3 }).toBuffer();
        const digest = crypto.createHash('sha256').update(encoded).digest('hex').slice(0, 12);
        const filename = key + '-' + digest + '.webp';
        fs.writeFileSync(path.join(out, filename), encoded);
        const art = textures[key] = { file: filename, width: info.width, height: info.height, frames: {} }, result = {};
        const figures=character==='mage'&&sources.staff?mageSpriteBounds(data,info.width,info.height,names.length,cols):null;
        for (const [n, name] of names.entries()) {
            const left = Math.round(n % cols * info.width / cols), top = Math.round(Math.floor(n / cols) * info.height / rows);
            const right = Math.round((n % cols + 1) * info.width / cols), bottom = Math.round((Math.floor(n / cols) + 1) * info.height / rows);
            let x0 = right, y0 = bottom, x1 = left, y1 = top;
            if(figures)({left:x0,top:y0,right:x1,bottom:y1}=figures[n]);
            else for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (data[(y * info.width + x) * 4 + 3] > (character==='mage'?160:80)) {
                x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
            }
            assert(x1 > x0 && y1 > y0, key + ' empty ' + name);
            art.frames[name] = [x0, y0, x1 - x0, y1 - y0];
            let pivot = east ? x0 + 110 : (left + right) / 2;
            if(character==='mage'){
                // Generated columns have unequal margins: anchor the boots, never the nominal cell centre.
                let footLeft=x1,footRight=x0;
                for(let y=Math.floor(y0+(y1-y0)*.88);y<y1;y++)for(let x=x0;x<x1;x++)
                    if(data[(y*info.width+x)*4+3]>160){footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);}
                assert(footRight>=footLeft,key+' missing boots '+name);
                pivot=(footLeft+footRight)/2;
            }
            result[name] = { texture: key, frame: name, origin: (pivot - x0) / (x1 - x0) };
        }
        return result;
    }
    const eight = (prefix, n = 8) => Array.from({ length: n }, (_, i) => prefix + i);
    for (const direction of ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']) {
        if (direction === 'east' && character === 'hunter') {
            const walk = await sheet('hunter-v2-east-walk', sources.east.walk, 4, 2, eight('walk-'), true);
            const shot = await sheet('hunter-v2-east-shot', sources.east.shot, 4, 2, eight('shot-'), true);
            poses[direction] = { height: textures['hunter-v2-east-shot'].frames['shot-0'][3], frames: { ...walk, ...shot } };
        } else {
            const key = character + '-v2-' + direction;
            if(character==='mage'&&sources.staff){
                const wand=await sheet(key,sources[direction],4,8,[...eight('walk-',16),...eight('cast-',16)]);
                const staff=await sheet(key+'-staff',sources.staff[direction],4,12,
                    ['staff-walk-','staff-cast-','staff-strike-'].flatMap(prefix=>eight(prefix,16)));
                for(const pose of Object.values(wand))pose.scale=40/textures[key].frames['cast-0'][3];
                for(const pose of Object.values(staff))pose.scale=40/textures[key+'-staff'].frames['staff-cast-0'][3];
                poses[direction]={height:textures[key].frames['cast-0'][3],count:16,frames:{...wand,...staff}};
                continue;
            }
            const names = character === 'mage'
                ? ['walk-','cast-','staff-walk-','staff-cast-','staff-strike-'].flatMap(prefix=>eight(prefix,mageCount))
                : [...eight('walk-'), ...eight(action)];
            const frames = await sheet(key, sources[direction], character==='mage'&&mageCount===16?8:4, character==='mage'?10:4, names);
            poses[direction] = { height: textures[key].frames[action + '0'][3], frames, ...(character==='mage'?{count:mageCount}:{}) };
        }
    }
    if(character!=='mage'||!fs.existsSync(path.join(out,'portrait.webp'))) {
        const [left, top, width, height] = textures[character + '-v2-south'].frames[action + '0'];
        await sharp(sources.south).extract({left, top, width, height}).webp({lossless:true,effort:3})
            .toFile(path.join(out,'portrait.webp'));
    }
    const vfx = await sharp(sources.vfx).metadata();
    assert.equal(vfx.width, vfx.height);
    if(character==='mage')assert.equal(vfx.height,1254,'Use the approved Mage VFX source with its measured row bounds.');
    const encoded = await sharp(sources.vfx).webp({ lossless: true, effort: 3 }).toBuffer();
    const digest = crypto.createHash('sha256').update(encoded).digest('hex').slice(0, 12);
    const vfxKey = character + '-vfx';
    textures[vfxKey] = { file: vfxKey + '-' + digest + '.webp', width:vfx.width, height:vfx.height, frames: Object.fromEntries(eight('', character==='mage'?36:16).map((name, n) => {
        if(character==='mage'){
            const row=Math.floor(n/6),col=n%6,edges=[0,208,401,594,788,980,1216];
            const x=Math.round(col*vfx.width/6),right=Math.round((col+1)*vfx.width/6);
            return [name,[x,edges[row],right-x,edges[row+1]-edges[row]]];
        }
        const x = Math.round(n % 4 * vfx.width / 4), y = Math.round(Math.floor(n / 4) * vfx.height / 4);
        return [name, [x, y, Math.round((n % 4 + 1) * vfx.width / 4) - x, Math.round((Math.floor(n / 4) + 1) * vfx.height / 4) - y]];
    })) };
    fs.writeFileSync(path.join(out, textures[vfxKey].file), encoded);
    fs.writeFileSync(path.join(root, character + '-frames.js'), '// Native source coordinates; generated by tools/pack_hunter_art.cjs.\nexport const ' + character + 'Textures = ' + JSON.stringify(textures) + ';\nexport const ' + character + 'Poses = ' + JSON.stringify(poses) + ';\n');
    console.log('Packed ' + character + (character==='mage'?`: 8 directions, ${mageCount*40} poses and 36 VFX frames.`:': 8 directions, 64 walk frames, 64 action frames and VFX without resampling.'));
})().catch(error => { console.error(error); process.exit(1); });
