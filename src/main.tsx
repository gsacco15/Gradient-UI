import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthDialog } from './components/AuthDialog';
import Landing from './landing/Landing';
import { usePath } from './router';
import './styles.css';

// Old share links pointed at "/#g=…"; they belong to the studio now.
if (!location.pathname.startsWith('/studio') && /[#&]g=/.test(location.hash)) {
  history.replaceState(null, '', `/studio${location.search}${location.hash}`);
}

function Root() {
  const path = usePath();
  return (
    <>
      {path.startsWith('/studio') ? <App /> : <Landing />}
      <AuthDialog />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
