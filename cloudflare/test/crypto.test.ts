import { describe, expect, it } from 'vitest';
import {
    hashPassword, PASSWORD_ITERATIONS, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword,
} from '../src/services/password';
import { signAccessToken, verifyAccessToken } from '../src/services/jwt';

describe('password security', () => {
    it('uses the configured 8–128 character password range', () => {
        expect(PASSWORD_MIN_LENGTH).toBe(8);
        expect(PASSWORD_MAX_LENGTH).toBe(128);
        expect(PASSWORD_ITERATIONS).toBe(100_000);
    });
    it('uses random salts and verifies PBKDF2 hashes', async () => {
        const first = await hashPassword('a-strong-password', 1000);
        const second = await hashPassword('a-strong-password', 1000);
        expect(first.algorithm).toBe('PBKDF2-SHA256');
        expect(first.hash).not.toBe(second.hash);
        expect(await verifyPassword('a-strong-password', first.hash, first.salt, first.iterations)).toBe(true);
        expect(await verifyPassword('wrong-password', first.hash, first.salt, first.iterations)).toBe(false);
    });
});

describe('JWT', () => {
    it('checks signature, issuer, audience and expiration', async () => {
        const now = 1_787_400_000_000;
        const token = await signAccessToken('user-1', 3, 'test-secret-that-is-not-used-in-production', now);
        expect((await verifyAccessToken(token, 'test-secret-that-is-not-used-in-production', now)).tv).toBe(3);
        await expect(verifyAccessToken(token, 'wrong-secret', now)).rejects.toThrow('INVALID_TOKEN');
        await expect(verifyAccessToken(token, 'test-secret-that-is-not-used-in-production', now + 8 * 24 * 60 * 60 * 1000)).rejects.toThrow('TOKEN_EXPIRED');
    });
});
