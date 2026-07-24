import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const workspace = resolve('.');
const buildRoot = resolve(workspace, '.desktop-build');
const unpacked = resolve(buildRoot, 'win-unpacked');
const portable = resolve(workspace, 'Anima List');

const cacheDirectoryNames = new Set([
    'cache',
    'code cache',
    'gpucache',
    'session storage',
    'local storage',
    'indexeddb',
    'crashpad',
    'logs',
    'temp',
]);

function assertChild(path) {
    if (!path.startsWith(`${workspace}\\`) && !path.startsWith(`${workspace}/`)) {
        throw new Error(`Refusing to modify a path outside the workspace: ${path}`);
    }
}

assertChild(buildRoot);
assertChild(unpacked);
assertChild(portable);
if (!existsSync(unpacked)) throw new Error(`Electron output is missing: ${unpacked}`);

// PC 主进程只使用 Node/Electron 内置模块。移动端 Capacitor 依赖及其
// Android build/.transforms 等缓存不得进入便携版。
const unpackedDependencies = resolve(unpacked, 'resources', 'app.asar.unpacked');
assertChild(unpackedDependencies);
rmSync(unpackedDependencies, { recursive: true, force: true });

function removeRuntimeCaches(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = resolve(directory, entry.name);
        assertChild(child);
        if (cacheDirectoryNames.has(entry.name.toLocaleLowerCase('en-US'))) {
            rmSync(child, { recursive: true, force: true });
        } else {
            removeRuntimeCaches(child);
        }
    }
}

removeRuntimeCaches(unpacked);
rmSync(portable, { recursive: true, force: true });
renameSync(unpacked, portable);
rmSync(buildRoot, { recursive: true, force: true });
console.log(`Portable desktop preview: ${resolve(portable, 'Anima List.exe')}`);
