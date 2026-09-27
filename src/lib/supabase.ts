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
  dialog: null | 'signin' | 'signup';
  afterAuth: (() => void) | null;
  open: (mode?: 'signin' | 'signup', then?: () => void) => void;
  close: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  ready: !supabase,
  dialog: null,
  afterAuth: null,
  open: (mode = 'signin', then) => set({ dialog: mode, afterAuth: then ?? null }),
  close: () => set({ dialog: null, afterAuth: null }),
}));

if (supabase) {
  supabase.auth.getSession().then(({ data }) => useAuth.setState({ session: data.session, ready: true }));
  supabase.auth.onAuthStateChange((_event, session) => {
    const { afterAuth } = useAuth.getState();
    useAuth.setState({ session });
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

export async function signOut() {
  await supabase?.auth.signOut();
}

// ---------------------------------------------------------------- community

export interface SharedGradient {
  id: string;
  user_id: string;
  author: string;
  name: string;
  place: string;
  gradient: Gradient;
  created_at: string;
  likes: number;
}

export type Sort = 'new' | 'top';

export async function listCommunity(sort: Sort, limit = 24): Promise<SharedGradient[]> {
  const q = need().from('community_gradients').select('*').limit(limit);
  const { data, error } = await (sort === 'top' ? q.order('likes', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false }));
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, gradient: hydrateGradient(r.gradient) })) as SharedGradient[];
}

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

export async function publish(g: Gradient): Promise<string> {
  const session = useAuth.getState().session;
  if (!session) throw new Error('Sign in to share.');
  const { id: _id, ...gradient } = g;
  const { data, error } = await need()
    .from('shared_gradients')
    .insert({ author: displayName(session).slice(0, 32), name: g.name.slice(0, 40) || 'UNTITLED', place: g.place.slice(0, 40), gradient })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function unpublish(id: string) {
  const { error } = await need().from('shared_gradients').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
