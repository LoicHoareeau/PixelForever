// Package independently placeable scenery. The playable map is built from terrain and collisions.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp'),assert=require('node:assert/strict');
(async()=>{
const source=process.argv[2];assert(source,'Pass the approved scenery atlas path.');
const out=path.resolve(__dirname,'../public/game/val-des-saules');
const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const names=['oak','willow','fir','rock','log','sign','cliff','flowers'],frames={};
for(const [n,name] of names.entries()){
const left=Math.round(n%4*info.width/4),right=Math.round((n%4+1)*info.width/4);
const top=Math.round(Math.floor(n/4)*info.height/2),bottom=Math.round((Math.floor(n/4)+1)*info.height/2);
let x0=right,y0=bottom,x1=left,y1=top;
for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(data[(y*info.width+x)*4+3]>80){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
assert(x1>x0&&y1>y0,name+' empty');
const w=x1-x0,h=y1-y0;
frames[name]={frame:{x:x0,y:y0,w,h},rotated:false,trimmed:false,sourceSize:{w,h},spriteSourceSize:{x:0,y:0,w,h}};
}
await sharp(source).webp({lossless:true,effort:3}).toFile(path.join(out,'clearing-props-v2.webp'));
fs.writeFileSync(path.join(out,'clearing-props-v2.json'),JSON.stringify({frames,meta:{image:'clearing-props-v2.webp',size:{w:info.width,h:info.height}}}));
console.log('8 independent scenery frames packed without resampling.');
})().catch(e=>{console.error(e);process.exit(1)});
