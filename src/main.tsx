import { lazy, StrictMode, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { createRoot } from 'react-dom/client';
import { AuthDialog } from './components/AuthDialog';
import Landing, { CommunityPage, NotFoundPage, PrivacyPage } from './landing/Landing';
import { ErrorBoundary } from './components/ErrorBoundary';

// The studio and the Lab load their own code only when opened, so the home page stays light.
const App = lazy(() => import('./App'));
const LedLab = lazy(() => import('./led/LedLab'));
const CdeLab = lazy(() => import('./cde/CdeLab'));
import { usePath } from './router';
import './styles.css';

// Old share links pointed at "/#g=…"; they belong to the studio now. (The Lab takes #g= too.)
if (!location.pathname.startsWith('/studio') && !location.pathname.startsWith('/led') && /[#&]g=/.test(location.hash)) {
  history.replaceState(null, '', `/studio${location.search}${location.hash}`);
}

function Root() {
  const path = usePath();
  const studio = path.startsWith('/studio');
  const share = /^\/g\/([A-Za-z0-9_-]{4,40})\/?$/.exec(path)?.[1];
  let page = <Landing key={share ?? 'home'} slug={share} />;
  if (/^\/led\/?$/.test(path)) page = <LedLab />;
  if (/^\/cde\/?$/.test(path)) page = <CdeLab />;
  if (/^\/community\/?$/.test(path)) page = <CommunityPage />;
  if (/^\/privacy\/?$/.test(path)) page = <PrivacyPage />;
  const known = path === '/' || studio || !!share || /^\/(led|cde|community|privacy)\/?$/.test(path);
  if (!known) page = <NotFoundPage />;
  if (studio) {
    page = <App />;
  }
  return (
    <>
      <ErrorBoundary key={path}>
        <Suspense fallback={<div className="gate-wait" />}>{page}</Suspense>
      </ErrorBoundary>
      <AuthDialog />
      <Analytics />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
