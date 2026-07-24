import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

function walk(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
    });
}

const sourceFiles = [...walk('www/js'), ...walk('scripts'), ...walk('tests'), ...walk('electron')]
    .filter(file => ['.js', '.mjs', '.cjs'].includes(extname(file)));

for (const file of sourceFiles) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['--check', 'scf_bangumi_proxy.js'], { stdio: 'inherit' });

const gradle = readFileSync('android/app/build.gradle', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const indexHtml = readFileSync('www/index.html', 'utf8');
const appEntry = readFileSync('www/js/app.js', 'utf8');
const electronMain = readFileSync('electron/main.cjs', 'utf8');
const pcLauncher = readFileSync('启动PC版.cmd', 'utf8');
// 拆分后前端逻辑分散在多个文件，故对整个 www/js 目录的拼接内容做断言，
// 避免绑定到具体文件名（模块再拆分时不误报）。
const webSource = sourceFiles
    .filter(file => file.replace(/\\/g, '/').includes('www/js/'))
    .map(file => readFileSync(file, 'utf8'))
    .join('\n');
const forbidden = [
    [/storePassword\s+['"][^'"]+/, 'Gradle 中不能包含明文 storePassword'],
    [/keyPassword\s+['"][^'"]+/, 'Gradle 中不能包含明文 keyPassword'],
];
for (const [pattern, message] of forbidden) {
    if (pattern.test(gradle)) throw new Error(message);
}
if (/MANAGE_EXTERNAL_STORAGE|requestLegacyExternalStorage|usesCleartextTraffic="true"/.test(manifest)) {
    throw new Error('Android Manifest 包含高风险存储或明文流量配置');
}
if (!indexHtml.includes('__animeTrackerStartupFailed') || !indexHtml.includes('onerror="window.__animeTrackerStartupFailed')) {
    throw new Error('启动页缺少模块加载失败兜底');
}
if (!appEntry.includes('window.__animeTrackerReady?.()')) {
    throw new Error('应用入口未在完成首次渲染后关闭启动页');
}
if (!webSource.includes('代理\n') && !webSource.includes('代理\r\n')) {
    throw new Error('代理按钮必须显示为“代理”');
}
if (!electronMain.includes('contextIsolation: true') || !electronMain.includes('nodeIntegration: false') || !electronMain.includes('sandbox: true')) {
    throw new Error('Electron 便携版必须启用隔离渲染安全配置');
}
if (!pcLauncher.includes('npm run dev -- --host 127.0.0.1') || !pcLauncher.includes('Invoke-WebRequest')) {
    throw new Error('PC 双击启动器缺少本地服务或就绪检查');
}
if (!webSource.includes('encoding: Encoding.UTF8') || !webSource.includes('await Share.share')) {
    throw new Error('移动端 JSON 导出必须使用 UTF-8 文件写入与原生分享');
}

// 版本号单一来源守卫：package.json / constants.js / build.gradle 必须一致。
const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const appVersionMatch = readFileSync('www/js/constants.js', 'utf8').match(/APP_VERSION = '([^']+)'/);
const versionNameMatch = gradle.match(/versionName "([^"]+)"/);
if (!appVersionMatch || appVersionMatch[1] !== pkgVersion) {
    throw new Error(`版本号不一致：constants.js APP_VERSION=${appVersionMatch?.[1]} ≠ package.json ${pkgVersion}（请运行 npm run sync:version）`);
}
if (!versionNameMatch || versionNameMatch[1] !== pkgVersion) {
    throw new Error(`版本号不一致：build.gradle versionName=${versionNameMatch?.[1]} ≠ package.json ${pkgVersion}（请运行 npm run sync:version）`);
}

console.log(`Source checks passed (${sourceFiles.length} files).`);
