const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../src/nodes/Peppox/peppox.svg');
const targetDirectory = path.resolve(__dirname, '../dist/nodes/Peppox');
fs.mkdirSync(targetDirectory, { recursive: true });
fs.copyFileSync(source, path.join(targetDirectory, 'peppox.svg'));
