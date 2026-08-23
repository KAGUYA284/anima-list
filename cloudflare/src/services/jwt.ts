import { base64UrlToBytes, bytesToBase64Url, constantTimeEqual } from './encoding';

const encoder = new TextEncoder();
const ISSUER = 'anima-list-api';
const AUDIENCE = 'anima-list-client';
export const ACCESS_TOKEN_SECONDS = 7 * 24 * 60 * 60;

export interface TokenPayload {
    sub: string;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
    tv: number;
}

async function signingKey(secret: string) {
    return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function signAccessToken(userId: string, tokenVersion: number, secret: string, now = Date.now()) {
    const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const issuedAt = Math.floor(now / 1000);
    const payload: TokenPayload = {
        sub: userId, iss: ISSUER, aud: AUDIENCE, iat: issuedAt,
        exp: issuedAt + ACCESS_TOKEN_SECONDS, tv: tokenVersion,
    };
    const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
    const data = `${header}.${body}`;
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(data)));
    return `${data}.${bytesToBase64Url(signature)}`;
}

export async function verifyAccessToken(token: string, secret: string, now = Date.now()): Promise<TokenPayload> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('INVALID_TOKEN');
    const data = `${parts[0]}.${parts[1]}`;
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(data)));
    if (!constantTimeEqual(expected, base64UrlToBytes(parts[2]))) throw new Error('INVALID_TOKEN');
    let payload: TokenPayload;
    try { payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as TokenPayload; }
    catch { throw new Error('INVALID_TOKEN'); }
    if (!payload.sub || payload.iss !== ISSUER || payload.aud !== AUDIENCE || !Number.isInteger(payload.tv)) throw new Error('INVALID_TOKEN');
    if (payload.exp <= Math.floor(now / 1000)) throw new Error('TOKEN_EXPIRED');
    return payload;
}
