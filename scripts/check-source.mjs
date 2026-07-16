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
const renderer = readFileSync('www/js/renderer.js', 'utf8');
const electronMain = readFileSync('electron/main.cjs', 'utf8');
const pcLauncher = readFileSync('启动PC版.cmd', 'utf8');
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
if (!renderer.includes('代理\n') && !renderer.includes('代理\r\n')) {
    throw new Error('代理按钮必须显示为“代理”');
}
if (!electronMain.includes('contextIsolation: true') || !electronMain.includes('nodeIntegration: false') || !electronMain.includes('sandbox: true')) {
    throw new Error('Electron 便携版必须启用隔离渲染安全配置');
}
if (!pcLauncher.includes('npm run dev -- --host 127.0.0.1') || !pcLauncher.includes('Invoke-WebRequest')) {
    throw new Error('PC 双击启动器缺少本地服务或就绪检查');
}
const eventsSource = readFileSync('www/js/events.js', 'utf8');
if (!eventsSource.includes('encoding: Encoding.UTF8') || !eventsSource.includes('await Share.share')) {
    throw new Error('移动端 JSON 导出必须使用 UTF-8 文件写入与原生分享');
}

console.log(`Source checks passed (${sourceFiles.length} files).`);
