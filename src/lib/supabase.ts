// Accounts + community wall, backed by Supabase. Everything here is optional:
// without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app runs without accounts.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Gradient } from '../types';
import { hydrateGradient } from './gradient';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Supabase calls this the publishable key (newer projects) or the anon key (older ones).
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
export const accountsEnabled = !!supabase;

// ---------------------------------------------------------------- session

interface AuthState {
  session: Session | null;
  ready: boolean;
  dialog: null | 'signin' | 'signup' | 'reset';
  reason: string | null; // why we're asking, shown under the title
  afterAuth: (() => void) | null;
  open: (mode?: 'signin' | 'signup' | 'reset', then?: () => void, reason?: string) => void;
  close: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  ready: !supabase,
  dialog: null,
  reason: null,
  afterAuth: null,
  open: (mode = 'signin', then, reason) => set({ dialog: mode, afterAuth: then ?? null, reason: reason ?? null }),
  close: () => set({ dialog: null, afterAuth: null, reason: null }),
}));

if (supabase) {
  supabase.auth.getSession().then(({ data }) => useAuth.setState({ session: data.session, ready: true }));
  supabase.auth.onAuthStateChange((event, session) => {
    const { afterAuth } = useAuth.getState();
    useAuth.setState({ session });
    // Arrived from a password reset email: ask for the new password straight away.
    if (event === 'PASSWORD_RECOVERY') {
      useAuth.setState({ dialog: 'reset', afterAuth: null, reason: null });
      return;
    }
    if (session && afterAuth) {
      useAuth.setState({ afterAuth: null });
      afterAuth();
    }
  });
}

export const displayName = (s: Session | null) =>
  (s?.user.user_metadata?.display_name as string | undefined) ?? s?.user.email?.split('@')[0] ?? 'anonymous';

/** Run `fn` now if signed in, otherwise open sign-in and run it right after. */
export function requireAccount(fn: () => void, mode: 'signin' | 'signup' = 'signup') {
  if (useAuth.getState().session) fn();
  else useAuth.getState().open(mode, fn);
}

const need = () => {
  if (!supabase) throw new Error('Accounts are not set up on this site yet.');
  return supabase;
};

const friendly = (msg: string) =>
  /invalid login/i.test(msg)
    ? 'Wrong email or password.'
    : /already registered|already exists/i.test(msg)
      ? 'That email already has an account. Sign in instead.'
      : /password.*(6|characters)/i.test(msg)
        ? 'Use a password with at least 6 characters.'
        : /email not confirmed/i.test(msg)
          ? 'Check your inbox to confirm your email first.'
          : /rate limit/i.test(msg)
            ? 'Too many attempts. Wait a minute and try again.'
            : /session missing|expired|invalid.*(token|link)/i.test(msg)
              ? 'This link has expired. Tap “Forgot password?” to get a new one.'
              : /should be different/i.test(msg)
                ? 'Choose a password you haven’t used before.'
            : msg;

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await need().auth.signUp({
    email,
    password,
    options: { data: { display_name: name.trim().slice(0, 32) || email.split('@')[0] }, emailRedirectTo: `${location.origin}/studio` },
  });
  if (error) throw new Error(friendly(error.message));
  // With "Confirm email" turned off in Supabase, a session comes straight back.
  return { needsConfirm: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await need().auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
}

export async function sendMagicLink(email: string) {
  const { error } = await need().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/studio` } });
  if (error) throw new Error(friendly(error.message));
}

/** Email a link that signs you in and asks for a new password. */
export async function sendPasswordReset(email: string) {
  const { error } = await need().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` });
  if (error) throw new Error(friendly(error.message));
}

export async function updatePassword(password: string) {
  const { error } = await need().auth.updateUser({ password });
  if (error) throw new Error(friendly(error.message));
}

export async function signOut() {
  await supabase?.auth.signOut();
}

// ---------------------------------------------------------------- community

export interface SharedGradient {
  id: string;
  slug: string;
  user_id: string;
  author: string;
  name: string;
  place: string;
  gradient: Gradient;
  listed: boolean;
  preview_path: string | null;
  created_at: string;
  likes: number;
}

export type Sort = 'new' | 'top';

const hydrateRow = (r: Record<string, unknown>) => ({ ...r, gradient: hydrateGradient((r.gradient ?? {}) as Partial<Gradient>) }) as SharedGradient;

/** The community wall: listed shares only. */
export async function listCommunity(sort: Sort, limit = 24, offset = 0): Promise<SharedGradient[]> {
  const q = need().from('community_gradients').select('*').eq('listed', true).range(offset, offset + limit - 1);
  const { data, error } = await (sort === 'top' ? q.order('likes', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false }));
  if (error) throw new Error(error.message);
  return (data ?? []).map(hydrateRow);
}

/** One share by its link code (listed or link-only). */
export async function getShared(slug: string): Promise<SharedGradient | null> {
  const { data, error } = await need().from('community_gradients').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? hydrateRow(data) : null;
}

export const shareUrl = (slug: string) => `${location.origin}/g/${slug}`;
export const previewUrl = (path: string | null) => (path && url ? `${url}/storage/v1/object/public/previews/${path}` : null);

export async function myLikes(): Promise<Set<string>> {
  const uid = useAuth.getState().session?.user.id;
  if (!supabase || !uid) return new Set();
  const { data } = await supabase.from('gradient_likes').select('gradient_id').eq('user_id', uid);
  return new Set((data ?? []).map((r) => r.gradient_id as string));
}

export async function setLike(id: string, liked: boolean) {
  const db = need();
  const { error } = liked ? await db.from('gradient_likes').insert({ gradient_id: id }) : await db.from('gradient_likes').delete().eq('gradient_id', id).eq('user_id', useAuth.getState().session!.user.id);
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
}

/**
 * Share a gradient. `listed` puts it on the community wall; otherwise it's link-only.
 * The preview image (for link cards in messages and social posts) is optional: sharing
 * still works if the upload fails.
 */
export async function publish(g: Gradient, opts: { listed: boolean; preview?: Blob | null }): Promise<SharedGradient> {
  const session = useAuth.getState().session;
  if (!session) throw new Error('Sign in to share.');
  const db = need();
  let preview_path: string | null = null;
  if (opts.preview) {
    const path = `${session.user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await db.storage.from('previews').upload(path, opts.preview, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (!error) preview_path = path;
  }
  const { id: _id, ...gradient } = g;
  const { data, error } = await db
    .from('shared_gradients')
    .insert({ author: displayName(session).slice(0, 32), name: g.name.slice(0, 40) || 'UNTITLED', place: g.place.slice(0, 40), gradient, listed: opts.listed, preview_path })
    .select('id, slug')
    .single();
  if (error) throw new Error(/(slug|listed|preview_path)/i.test(error.message) && /column|schema cache/i.test(error.message) ? 'Sharing needs its one-time database update: run supabase/sharing.sql in the Supabase SQL Editor.' : error.message);
  return { id: data.id, slug: data.slug, user_id: session.user.id, author: displayName(session), name: g.name, place: g.place, gradient: g, listed: opts.listed, preview_path, created_at: new Date().toISOString(), likes: 0 };
}

export async function unpublish(id: string) {
  const { error } = await need().from('shared_gradients').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
