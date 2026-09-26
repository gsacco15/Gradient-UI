// Sign up / sign in: email + password, no codes. A sign-in link by email is the fallback.
import { useState } from 'react';
import { accountsEnabled, sendMagicLink, signIn, signUp, useAuth } from '../lib/supabase';

export function AuthDialog() {
  const mode = useAuth((s) => s.dialog);
  const close = useAuth((s) => s.close);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  if (!mode) return null;
  const signup = mode === 'signup';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (signup) {
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
        <h2 id="auth-title">{signup ? 'Join Atmos' : 'Welcome back'}</h2>
        <p className="auth-sub">{signup ? 'Share gradients to the community and like other people’s work.' : 'Sign in to share and like gradients.'}</p>
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
            <label>
              <span>Email</span>
              <input id="auth-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </label>
            <label>
              <span>Password</span>
              <input id="auth-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={signup ? 'At least 6 characters' : ''} autoComplete={signup ? 'new-password' : 'current-password'} />
            </label>
            {error && <p className="auth-error">{error}</p>}
            {info && <p className="auth-info">{info}</p>}
            <button className="auth-submit" disabled={busy}>
              {busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
            </button>
            {!signup && (
              <button type="button" className="auth-link" onClick={magic} disabled={busy}>
                Forgot it? Email me a sign-in link
              </button>
            )}
          </form>
        )}
        <p className="auth-switch">
          {signup ? 'Already have an account?' : 'New here?'}{' '}
          <button className="auth-link inline" onClick={() => useAuth.setState({ dialog: signup ? 'signin' : 'signup' })}>
            {signup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </div>
  );
}
