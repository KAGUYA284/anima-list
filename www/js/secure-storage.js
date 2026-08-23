import { AUTH_TOKEN_KEY } from './constants.js';

function androidSecureStorage() {
    return globalThis.Capacitor?.Plugins?.AnimaSecureStorage || null;
}

export const secureTokenStorage = {
    async getToken() {
        const desktop = globalThis.animaListDesktop?.secureToken;
        if (desktop?.get) return desktop.get();
        const android = androidSecureStorage();
        if (android?.get) return (await android.get()).value || null;
        return localStorage.getItem(AUTH_TOKEN_KEY);
    },
    async setToken(token) {
        const desktop = globalThis.animaListDesktop?.secureToken;
        if (desktop?.set) return desktop.set(token);
        const android = androidSecureStorage();
        if (android?.set) { await android.set({ value: token }); return true; }
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        return true;
    },
    async removeToken() {
        const desktop = globalThis.animaListDesktop?.secureToken;
        if (desktop?.remove) return desktop.remove();
        const android = androidSecureStorage();
        if (android?.remove) { await android.remove(); return true; }
        localStorage.removeItem(AUTH_TOKEN_KEY);
        return true;
    },
};
