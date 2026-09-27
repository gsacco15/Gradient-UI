// Sign up / sign in: email + password, no codes. A sign-in link by email is the fallback.
import { useState } from 'react';
import { accountsEnabled, sendMagicLink, sendPasswordReset, signIn, signUp, updatePassword, useAuth } from '../lib/supabase';

export function AuthDialog() {
  const mode = useAuth((s) => s.dialog);
  const close = useAuth((s) => s.close);
  const reason = useAuth((s) => s.reason);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  if (!mode) return null;
  const signup = mode === 'signup';
  const reset = mode === 'reset';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (reset) {
        if (password !== confirm) throw new Error('The two passwords don’t match.');
        await updatePassword(password);
        setInfo('Password updated. You’re signed in.');
        setPassword('');
        setConfirm('');
        setTimeout(close, 1400);
      } else if (signup) {
        const { needsConfirm } = await signUp(email.trim(), password, name);
        if (needsConfirm) setInfo('Almost there. Open the email we just sent to finish signing up.');
        else close();
      } else {
        await signIn(email.trim(), password);
        close();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Type your email first, then tap “Forgot password?”.');
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(email.trim());
      setInfo(`Reset link sent to ${email.trim()}. Open it to choose a new password.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const magic = async () => {
    if (!email.trim()) return setError('Type your email first.');
    setBusy(true);
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setInfo(`Sign-in link sent to ${email.trim()}. Open it on this device.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-backdrop" onClick={close}>
      <div className="auth" role="dialog" aria-labelledby="auth-title" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={close} aria-label="Close">
          ×
        </button>
        <h2 id="auth-title">{reset ? 'Set a new password' : signup ? 'Join Atmos' : 'Welcome back'}</h2>
        <p className="auth-sub">{reset ? 'Choose a new password for your account.' : reason ?? (signup ? 'Free. Make gradients, share them to the community and like other people’s work.' : 'Sign in to open the studio.')}</p>
        {!accountsEnabled ? (
          <p className="auth-note">Accounts aren’t switched on for this site yet. The studio works fully without one.</p>
        ) : (
          <form onSubmit={submit} className="auth-form">
            {signup && (
              <label>
                <span>Name shown on your gradients</span>
                <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grant" maxLength={32} autoComplete="nickname" />
              </label>
            )}
            {!reset && (
            <label>
              <span>Email</span>
              <input id="auth-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </label>
            )}
            <label>
              <span>{reset ? 'New password' : 'Password'}</span>
              <input id="auth-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={signup || reset ? 'At least 6 characters' : ''} autoComplete={signup || reset ? 'new-password' : 'current-password'} />
            </label>
            {reset && (
              <label>
                <span>Type it again</span>
                <input id="auth-confirm" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </label>
            )}
            {error && <p className="auth-error">{error}</p>}
            {info && <p className="auth-info">{info}</p>}
            <button className="auth-submit" disabled={busy}>
              {busy ? 'One moment…' : reset ? 'Save new password' : signup ? 'Create account' : 'Sign in'}
            </button>
            {!signup && !reset && (
              <>
                <button type="button" className="auth-link" onClick={forgot} disabled={busy}>
                  Forgot password? Email me a reset link
                </button>
                <button type="button" className="auth-link subtle" onClick={magic} disabled={busy}>
                  Or email me a one-time sign-in link
                </button>
              </>
            )}
          </form>
        )}
        {!reset && (
        <p className="auth-switch">
          {signup ? 'Already have an account?' : 'New here?'}{' '}
          <button className="auth-link inline" onClick={() => useAuth.setState({ dialog: signup ? 'signin' : 'signup' })}>
            {signup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        )}
      </div>
    </div>
  );
}
