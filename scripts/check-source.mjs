import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

function walk(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
    });
}

const sourceFiles = [...walk('www/js'), ...walk('scripts'), ...walk('tests')]
    .filter(file => ['.js', '.mjs'].includes(extname(file)));

for (const file of sourceFiles) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

const gradle = readFileSync('android/app/build.gradle', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
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

console.log(`Source checks passed (${sourceFiles.length} files).`);
