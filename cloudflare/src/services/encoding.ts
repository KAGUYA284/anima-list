export function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
}
