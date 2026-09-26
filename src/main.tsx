import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { gradientFromHash } from './lib/share';
import { useStore } from './store';
import './styles.css';

// Open a shared gradient from the URL, then clear the hash so reloads don't reset edits.
const shared = gradientFromHash(location.hash);
if (shared) {
  useStore.getState().load(shared);
  history.replaceState(null, '', location.pathname + location.search);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
