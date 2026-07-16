import { randomInt } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspace = resolve('.');
const androidDir = resolve(workspace, 'android');
const keystore = resolve(androidDir, 'release.keystore');
const properties = resolve(androidDir, 'keystore.properties');
const keytool = resolve(process.env.JAVA_HOME || 'C:\\Program Files\\Java\\jdk-17', 'bin', 'keytool.exe');

if (existsSync(keystore) && existsSync(properties)) {
    console.log('Existing local release signing key retained.');
    process.exit(0);
}
if (existsSync(keystore) || existsSync(properties)) {
    throw new Error('Release signing files are incomplete; restore or remove the remaining file before retrying.');
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const password = Array.from({ length: 32 }, () => alphabet[randomInt(alphabet.length)]).join('');
const alias = 'anime-tracker-release';
const result = spawnSync(keytool, [
    '-genkeypair',
    '-v',
    '-keystore', keystore,
    '-storetype', 'PKCS12',
    '-storepass', password,
    '-keypass', password,
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', '4096',
    '-validity', '10000',
    '-dname', 'CN=Anime Tracker, OU=Local Release, O=Anime Tracker, L=Shanghai, ST=Shanghai, C=CN',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (result.status !== 0) {
    throw new Error(`keytool failed: ${result.stderr || result.stdout}`);
}

writeFileSync(properties, [
    'storeFile=../release.keystore',
    `storePassword=${password}`,
    `keyAlias=${alias}`,
    `keyPassword=${password}`,
    '',
].join('\n'), { encoding: 'utf8', flag: 'wx' });
console.log('Created local Android release signing key and ignored Gradle properties.');
