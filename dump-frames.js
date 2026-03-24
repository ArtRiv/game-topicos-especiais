const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

loadImage('public/assets/spells/Water Effect 01/Water Effect SpriteSheet/Water Spike 01 - SpriteSheet.png').then(image => {
    for(let i=0; i<4; i++) {
        const canvas = createCanvas(80, 80);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, i*80, 0, 80, 80, 0, 0, 80, 80);
        const buf = canvas.toBuffer('image/png');
        fs.writeFileSync(`frame_${i}.png`, buf);
    }
    console.log("Frames dumped.");
});