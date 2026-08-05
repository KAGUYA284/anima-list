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
const webLauncher = readFileSync('scripts/release/启动网页版.cmd', 'utf8');
const webServer = readFileSync('scripts/release/server.ps1', 'utf8');
const proxySource = readFileSync('scf_bangumi_proxy.js', 'utf8');
const releasePackage = readFileSync('scripts/package-release.ps1', 'utf8');
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
if (!electronMain.includes("app.setPath('userData'") || !electronMain.includes('.anima-list-cache-test')) {
    throw new Error('Electron 缓存测试版缺少独立 userData 配置');
}
if (!webLauncher.includes('server.ps1') || !webServer.includes('TcpListener') || !webServer.includes('Start-Process')) {
    throw new Error('网页版启动器缺少本地静态服务或浏览器启动逻辑');
}
if (!webSource.includes('encoding: Encoding.UTF8') || !webSource.includes('await Share.share')) {
    throw new Error('移动端 JSON 导出必须使用 UTF-8 文件写入与原生分享');
}
if (!proxySource.includes("path === '/yuc/anime'") || !proxySource.includes("hostname: 'yuc.wiki'")) {
    throw new Error('SCF 代理缺少固定主机的长门有希季度信息抓取路由');
}
if (!proxySource.includes("path === '/yuc/season'") || !proxySource.includes('updatePeriodFromBroadcast')) {
    throw new Error('SCF 代理缺少季度新番表路由或播出时段映射');
}
if (!webSource.includes("listStyle: 'cover'") || !webSource.includes('showAnimeDetails: true')) {
    throw new Error('设置缺少默认封面模式或番剧具体信息开关');
}
if (!webSource.includes("listOrder: 'time'") || !webSource.includes('data-list-order') || !webSource.includes('compareChasingForDisplay')) {
    throw new Error('设置缺少列表展示次序或列表未接入排序逻辑');
}
if (!webSource.includes('enrichImportedAnimeList') || !webSource.includes('导入番剧信息补全完成并已保存')) {
    throw new Error('JSON 导入缺少 Bangumi/yuc 信息补全与本地保存流程');
}
if (!webSource.includes('state.settings.showAnimeDetails && anime.bgmId')) {
    throw new Error('关闭具体信息后仍可能加载角色与声优信息');
}
if (webSource.includes('data-update-source') || webSource.includes('更新时间来源')) {
    throw new Error('设置中仍存在已移除的更新时间来源选项');
}
if (!webSource.includes('getYucAnime') || !webSource.includes('formUpdateTime')) {
    throw new Error('前端缺少长门有希信息查询或具体更新时间字段');
}
if (!webSource.includes('getYucSeasonList') || !webSource.includes('yucScheduleBtn') || !webSource.includes("case 'yucSchedule'")) {
    throw new Error('前端缺少季度新番表入口或数据加载逻辑');
}
if (!webSource.includes('yucYearFilter') || !webSource.includes('yucQuarterFilter') || !webSource.includes("YUC_MIN_SEASON = '201910'")) {
    throw new Error('新番表缺少年份/季度筛选器或 2019 年 10 月数据边界');
}
if (!webSource.includes('searchBangumiForYuc') || !webSource.includes('bgmId: bangumi?.id') || !webSource.includes('{ navigate: false }')) {
    throw new Error('新番表添加未保留页面或未通过 Bangumi 匹配元数据');
}
if (!webSource.includes('yuc-weekday-section') || !webSource.includes('record.imageUrl')) {
    throw new Error('新番表缺少按星期分组或 yuc.wiki 番剧图片');
}
if (!electronMain.includes("preload: path.join(__dirname, 'preload.cjs')") || !webSource.includes('animaListDesktop')) {
    throw new Error('Electron 缺少端侧 yuc 页面抓取桥接');
}
if (releasePackage.includes('Compress-Archive') || !releasePackage.includes('Windows\\免安装版') || !releasePackage.includes('test-user-data')) {
    throw new Error('发布脚本仍将免安装版压缩，或缺少缓存测试版数据目录');
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
