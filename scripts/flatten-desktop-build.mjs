import { existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const workspace = resolve('.');
const buildRoot = resolve(workspace, '.desktop-build');
const unpacked = resolve(buildRoot, 'win-unpacked');
const portable = resolve(workspace, 'Anima Tracker');

function assertChild(path) {
    if (!path.startsWith(`${workspace}\\`) && !path.startsWith(`${workspace}/`)) {
        throw new Error(`Refusing to modify a path outside the workspace: ${path}`);
    }
}

assertChild(buildRoot);
assertChild(unpacked);
assertChild(portable);
if (!existsSync(unpacked)) throw new Error(`Electron output is missing: ${unpacked}`);

rmSync(portable, { recursive: true, force: true });
renameSync(unpacked, portable);
rmSync(buildRoot, { recursive: true, force: true });
console.log(`Portable desktop preview: ${resolve(portable, 'Anima Tracker.exe')}`);
