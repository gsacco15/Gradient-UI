import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthDialog } from './components/AuthDialog';
import Landing from './landing/Landing';
import { accountsEnabled, useAuth } from './lib/supabase';
import { navigate, usePath } from './router';
import { useEffect } from 'react';
import './styles.css';

// Old share links pointed at "/#g=…"; they belong to the studio now.
if (!location.pathname.startsWith('/studio') && /[#&]g=/.test(location.hash)) {
  history.replaceState(null, '', `/studio${location.search}${location.hash}`);
}

/**
 * The studio is for signed-in people. Signed-out visitors land on the home page with the
 * sign-up box open, then continue to exactly where they were going (shared links included).
 */
function StudioGate() {
  useEffect(() => {
    const target = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    useAuth.getState().open('signup', () => navigate(target), 'Create a free account to open the studio. It takes ten seconds.');
  }, []);
  return null;
}

function Root() {
  const path = usePath();
  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);
  const studio = path.startsWith('/studio');
  const share = /^\/g\/([A-Za-z0-9_-]{4,40})\/?$/.exec(path)?.[1];
  let page = <Landing key={share ?? 'home'} slug={share} />;
  if (studio) {
    if (!accountsEnabled || session) page = <App />;
    else page = ready ? <StudioGate /> : <div className="gate-wait" />;
  }
  return (
    <>
      {page}
      <AuthDialog />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
