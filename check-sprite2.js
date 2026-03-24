const { createCanvas, loadImage } = require('canvas');
loadImage('public/assets/spells/Water Effect 01/Water Effect SpriteSheet/Water Spike 01 - SpriteSheet.png').then(image => {
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    for(let i=0; i<16; i++) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        let minX = 80, maxX = -1;
        for(let y=0; y<80; y++) {
            for(let x=0; x<80; x++) {
                const idx = ((row*80 + y)*image.width + (col*80 + x))*4;
                if(data[idx+3] > 0) {
                    if(x < minX) minX = x;
                    if(x > maxX) maxX = x;
                }
            }
        }
        console.log('Frame ' + i + ': x bounds ' + minX + '..' + maxX);
    }
});
