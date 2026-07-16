import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

if (!existsSync('dist/index.html')) throw new Error('dist/index.html 不存在，请先运行 npm run build');
const html = readFileSync('dist/index.html', 'utf8');
if (/src=["']js\//.test(html)) throw new Error('dist 仍引用未打包的 www/js 源文件');

const assets = readdirSync('dist/assets');
const jsFile = assets.find(file => file.endsWith('.js'));
const cssFile = assets.find(file => file.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('dist 缺少打包后的 JavaScript 或 CSS');
if (!html.includes(join('assets', jsFile).replaceAll('\\', '/'))) throw new Error('dist/index.html 未引用打包后的 JavaScript');

console.log(`Distribution is complete: ${jsFile}, ${cssFile}`);
