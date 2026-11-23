import test from 'node:test';
import assert from 'node:assert/strict';
import mageSpriteBounds from '../tools/mage-sprite-bounds.cjs';

test('les sprites complets restent ordonnés malgré des marges et hauteurs de lignes inégales',()=>{
    const width=80,height=90,data=new Uint8Array(width*height*4);
    const rect=(left,top,right,bottom)=>{for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)data[(y*width+x)*4+3]=255;};
    rect(3,10,13,28);rect(45,8,56,31);rect(5,60,16,83);rect(46,55,59,79);
    rect(14,8,16,10); // Detached crystal near the first figure belongs to its full crop.
    rect(73,44,75,46); // Distant speck is not part of a character.
    const figures=mageSpriteBounds(data,width,height,4,2);
    assert.deepEqual(figures.map(f=>f.left),[3,45,5,46]);
    assert.equal(figures[0].right,16);assert.equal(figures[0].top,8);
    assert.throws(()=>mageSpriteBounds(data,width,height,5,2));
    const opaque=new Uint8Array(width*height*4).fill(255);
    assert.throws(()=>mageSpriteBounds(opaque,width,height,4,2),'un fond opaque doit être refusé');
});
