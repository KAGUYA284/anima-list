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
const syncService = readFileSync('www/js/sync-service.js', 'utf8');
const workerPassword = readFileSync('cloudflare/src/services/password.ts', 'utf8');
const workerJwt = readFileSync('cloudflare/src/services/jwt.ts', 'utf8');
const workerSync = readFileSync('cloudflare/src/routes/sync.ts', 'utf8');
const workerMigration = readFileSync('cloudflare/migrations/0001_initial.sql', 'utf8');
const workerExample = readFileSync('cloudflare/wrangler.toml.example', 'utf8');
const androidSecureStorage = readFileSync('android/app/src/main/java/com/animetracker/app/AnimaSecureStoragePlugin.java', 'utf8');
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
if (/\?\.(?!\.)|\?\?|\.at\(|\.matchAll\(/.test(proxySource)) {
    throw new Error('SCF 代理包含旧版腾讯 Node 运行时无法解析或执行的语法');
}
if (!proxySource.includes('proxyBangumiSearch') || !proxySource.includes('legacy-search')) {
    throw new Error('SCF 代理缺少 Bangumi 搜索 5xx 降级路径');
}
if (!webSource.includes('getBangumiEndpointOrder') || !webSource.includes('[API_PROXIES.direct, API_PROXIES.proxy1]')) {
    throw new Error('Bangumi 数据请求缺少直连/代理双向自动降级');
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
if (!webSource.includes('searchBangumiForYuc') || !webSource.includes('buildSeasonalAnime') || !webSource.includes("bgmId: subject?.id ? String(subject.id) : ''") || !webSource.includes('{ navigate: false }')) {
    throw new Error('新番表添加未保留页面或未通过 Bangumi 匹配元数据');
}
if (!webSource.includes('findExistingSeasonalAnime') || !webSource.includes('getBangumiSubject(bangumi.id)')) {
    throw new Error('新番表添加缺少 Bangumi 完整信息读取或 bgmId 去重');
}
if (!webSource.includes('clearAnimeListBtn') || !webSource.includes('clearAnimeList()')) {
    throw new Error('设置页缺少清空所有番剧功能');
}
if (!webSource.includes('anime-swipe-actions') || !webSource.includes('data-card-edit') || !webSource.includes('data-card-delete')) {
    throw new Error('主页番剧卡片缺少左滑编辑与删除操作');
}
if (!syncService.includes('baseRevision') || !syncService.includes('SyncConflictError') || !webSource.includes('ANIMA_LOCAL_DIRTY')) {
    throw new Error('客户端缺少 revision/dirty 同步或显式冲突处理');
}
if (!webSource.includes("SYNC_API_URL = 'https://anima-list-api.anima-list-api.workers.dev'") || webSource.includes('id="syncApiUrl"')) {
    throw new Error('生产同步地址未固定，或设置页仍允许用户修改服务地址');
}
if (!electronMain.includes("ipcMain.handle('sync.fetch'") || !electronMain.includes('safeStorage.encryptString')
    || !electronMain.includes('net.fetch(url.href')) {
    throw new Error('Electron 缺少受限同步请求或系统凭据加密');
}
if (!androidSecureStorage.includes('AndroidKeyStore') || !androidSecureStorage.includes('AES/GCM/NoPadding')) {
    throw new Error('Android Token 未使用 Keystore AES-GCM 安全存储');
}
if (!workerPassword.includes('PBKDF2') || !workerPassword.includes('100_000')
    || !workerPassword.includes('PASSWORD_MIN_LENGTH = 8') || !workerPassword.includes('PASSWORD_MAX_LENGTH = 128')
    || !workerJwt.includes("iss: ISSUER")) {
    throw new Error('Worker 缺少 PBKDF2 密码保护或完整 JWT 声明');
}
if (!workerSync.includes('WHERE user_id = ? AND revision = ?') || !workerSync.includes("code: 'SYNC_CONFLICT'")) {
    throw new Error('Worker 缺少 D1 条件写入或 409 冲突响应');
}
if (!workerMigration.includes('password_salt') || !workerMigration.includes('revision INTEGER') || !workerMigration.includes('FOREIGN KEY')) {
    throw new Error('D1 初始化迁移缺少安全认证或同步修订字段');
}
if (workerExample.includes('JWT_SECRET =') || workerExample.includes('database_id = "REPLACE_WITH_D1_DATABASE_ID"') === false) {
    throw new Error('Wrangler 示例泄漏 Secret 或未使用数据库 ID 占位符');
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
