const sharp = require('../../frontend/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'source-icon.svg');
const pngPath = path.join(__dirname, 'icon-1024.png');

const svgBuffer = fs.readFileSync(svgPath);

sharp(svgBuffer, { density: 384 })
  .resize(1024, 1024)
  .png()
  .toFile(pngPath)
  .then(() => console.log('✓ Rasterized:', pngPath))
  .catch(err => { console.error('✗ Rasterization failed:', err); process.exit(1); });
