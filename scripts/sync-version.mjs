// ============================================================
// 版本号单一来源同步脚本 - Anime Tracker
// ------------------------------------------------------------
// 以 package.json 的 version 为唯一权威来源，同步写入：
//   - www/js/constants.js 的 APP_VERSION
//   - android/app/build.gradle 的 versionName
// 由 `npm run prebuild` 在每次构建前自动执行，保证三处一致。
// versionCode 递增由人工在 build.gradle 中维护（发版规则见 README）。
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`package.json version 非法：${version}（应形如 1.2.3）`);
}

const edits = [];

// 1) www/js/constants.js —— APP_VERSION
const constantsPath = 'www/js/constants.js';
const constants = readFileSync(constantsPath, 'utf8');
const constantsPattern = /(export const APP_VERSION = ')([^']*)(';)/;
if (!constantsPattern.test(constants)) {
    throw new Error('constants.js 中未找到 APP_VERSION 定义');
}
const nextConstants = constants.replace(constantsPattern, `$1${version}$3`);
if (nextConstants !== constants) {
    writeFileSync(constantsPath, nextConstants);
    edits.push(`${constantsPath} → APP_VERSION=${version}`);
}

// 2) android/app/build.gradle —— versionName
const gradlePath = 'android/app/build.gradle';
const gradle = readFileSync(gradlePath, 'utf8');
const gradlePattern = /(versionName ")([^"]*)(")/;
if (!gradlePattern.test(gradle)) {
    throw new Error('build.gradle 中未找到 versionName 定义');
}
const nextGradle = gradle.replace(gradlePattern, `$1${version}$3`);
if (nextGradle !== gradle) {
    writeFileSync(gradlePath, nextGradle);
    edits.push(`${gradlePath} → versionName=${version}`);
}

if (edits.length) {
    console.log(`[sync-version] 已同步到 v${version}：\n  - ${edits.join('\n  - ')}`);
} else {
    console.log(`[sync-version] 版本已一致：v${version}`);
}
