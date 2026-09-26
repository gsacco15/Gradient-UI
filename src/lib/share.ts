// Share links: the whole gradient lives in the URL hash — no backend.
import type { Gradient } from '../types';
import { hydrateGradient } from './gradient';

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeGradient(g: Gradient): string {
  const { id: _id, ...rest } = g;
  return toBase64Url(JSON.stringify(rest));
}

export function decodeGradient(s: string): Gradient | null {
  try {
    return hydrateGradient(JSON.parse(fromBase64Url(s)));
  } catch {
    return null;
  }
}

export function shareLink(g: Gradient): string {
  return `${location.origin}${location.pathname}#g=${encodeGradient(g)}`;
}

export function gradientFromHash(hash: string): Gradient | null {
  const m = /[#&]g=([A-Za-z0-9_-]+)/.exec(hash);
  return m ? decodeGradient(m[1]) : null;
}
