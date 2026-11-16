// With hash routing, SvelteKit writes absolute asset paths ("/_app/...") into index.html.
// Make them relative so the built app works from any folder or sub-path
// (a container on the EduStack, a reverse-proxy path, or a static preview host).
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../build/index.html', import.meta.url);
let html = await readFile(file, 'utf8');
html = html
	.replace(/(href|src)="\/(?!\/)/g, '$1="./')
	.replace(/import\("\/app\//g, 'import("./app/')
	.replace(/'\/service-worker\.js'/g, "'./service-worker.js'");
await writeFile(file, html);
console.log('index.html: asset paths made relative');
