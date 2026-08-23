import { base64UrlToBytes, bytesToBase64Url, constantTimeEqual } from './encoding';

export const PASSWORD_ITERATIONS = 210_000;
const encoder = new TextEncoder();

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations }, key, 256);
    return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt, iterations);
    return { hash: bytesToBase64Url(hash), salt: bytesToBase64Url(salt), iterations, algorithm: 'PBKDF2-SHA256' };
}

export async function verifyPassword(password: string, expectedHash: string, salt: string, iterations: number) {
    const actual = await derive(password, base64UrlToBytes(salt), iterations);
    return constantTimeEqual(actual, base64UrlToBytes(expectedHash));
}
