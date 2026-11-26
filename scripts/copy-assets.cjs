const fs = require('node:fs');
const path = require('node:path');

const assets = [
	['../nodes/Peppox/peppox.svg', '../dist/nodes/Peppox/peppox.svg'],
	['../credentials/peppox.svg', '../dist/credentials/peppox.svg'],
];

for (const [source, target] of assets) {
	const sourcePath = path.resolve(__dirname, source);
	const targetPath = path.resolve(__dirname, target);
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.copyFileSync(sourcePath, targetPath);
}
