const assert=require('node:assert/strict');

// Detect complete figures rather than assuming that generated rows have perfectly equal margins.
module.exports=function mageSpriteBounds(data,width,height,count,columns=4){
    const visited=new Uint8Array(width*height),queue=new Int32Array(width*height),components=[];
    for(let pixel=0;pixel<visited.length;pixel++){
        if(visited[pixel]||data[pixel*4+3]<=160)continue;
        let head=0,tail=1;queue[0]=pixel;visited[pixel]=1;
        let left=width,top=height,right=0,bottom=0;
        while(head<tail){
            const index=queue[head++],x=index%width,y=Math.floor(index/width);
            left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);
            for(const next of [x>0?index-1:-1,x+1<width?index+1:-1,y>0?index-width:-1,y+1<height?index+width:-1]){
                if(next<0||visited[next]||data[next*4+3]<=160)continue;
                visited[next]=1;queue[tail++]=next;
            }
        }
        if(tail>=4)components.push({left,top,right,bottom,area:tail});
    }
    const largest=Math.max(...components.map(c=>c.area));
    const figures=components.filter(c=>c.area>=largest*.25).map(c=>({...c}));
    assert.equal(figures.length,count,`Expected ${count} complete Mage figures, found ${figures.length}`);
    for(const part of components.filter(c=>c.area<largest*.25)){
        const x=(part.left+part.right)/2,y=(part.top+part.bottom)/2;
        const distances=figures.map(f=>Math.hypot(Math.max(f.left-x,0,x-f.right),Math.max(f.top-y,0,y-f.bottom)));
        const index=distances.indexOf(Math.min(...distances)),figure=figures[index];
        if(distances[index]>Math.max(figure.right-figure.left,figure.bottom-figure.top)*.3)continue;
        figure.left=Math.min(figure.left,part.left);figure.right=Math.max(figure.right,part.right);
        figure.top=Math.min(figure.top,part.top);figure.bottom=Math.max(figure.bottom,part.bottom);
    }
    figures.sort((a,b)=>(a.top+a.bottom)-(b.top+b.bottom));
    const ordered=[];
    for(let start=0;start<figures.length;start+=columns)
        ordered.push(...figures.slice(start,start+columns).sort((a,b)=>a.left-b.left));
    for(const f of ordered)assert(f.left>0&&f.top>0&&f.right<width&&f.bottom<height,'Mage figure clipped by source canvas');
    return ordered;
};
