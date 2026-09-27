import { useEffect, useState } from 'react';
import { GradientCanvas } from './components/Canvas';
import { ExportDialog } from './components/ExportDialog';
import { HorizonInspector, HorizonView } from './components/HorizonView';
import { Inspector } from './components/Inspector';
import { InterfaceInspector, InterfaceView } from './components/InterfaceView';
import { Library } from './components/Library';
import { StopBar } from './components/StopBar';
import { PosterInspector, PosterView } from './components/PosterView';
import { Thumb } from './components/Thumb';
import { Welcome } from './components/Welcome';
import { remix } from './lib/generate';
import { gradientFromHash } from './lib/share';
import { accountsEnabled, displayName, publish, requireAccount, signOut, useAuth } from './lib/supabase';
import { linkTo, navigate } from './router';
import { useStore, type View } from './store';

const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: 'gradient', label: 'GRADIENT', hint: 'Edit' },
  { id: 'horizon', label: 'HORIZON', hint: 'Photo → film' },
  { id: 'interface', label: 'INTERFACE', hint: 'See it on screens' },
  { id: 'poster', label: 'POSTER', hint: 'Print it' },
];

type MobilePane = 'canvas' | 'library' | 'inspector';

export default function App() {
  const view = useStore((s) => s.view);
  const exportOpen = useStore((s) => s.exportOpen);
  const remixOpen = useStore((s) => s.remixOpen);
  const toast = useStore((s) => s.toast);
  const welcomeOpen = useStore((s) => s.welcomeOpen);
  const [compare, setCompare] = useState(false);
  const [pane, setPane] = useState<MobilePane>('canvas');

  useShortcuts(setCompare);
  useIncomingLinks();

  return (
    <div className={`app pane-${pane}`}>
      <TopBar compare={compare} setCompare={setCompare} />
      <aside className="left">
        <Library />
      </aside>
      <main className="center">
        <div className="stage">
          {view === 'gradient' && <GradientCanvas compare={compare} />}
          {view === 'horizon' && <HorizonView />}
          {view === 'interface' && <InterfaceView />}
          {view === 'poster' && <PosterView />}
        </div>
        {view === 'gradient' && <StopBar />}
        <nav className="view-tabs">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => useStore.getState().setView(v.id)}>
              [ {v.label} ]<span className="muted"> {v.hint}</span>
            </button>
          ))}
          {view === 'gradient' && <span className="kbd-hint">DOUBLE-CLICK CANVAS TO ADD · HOLD C TO COMPARE · ⌘Z UNDO</span>}
        </nav>
      </main>
      <aside className="right">
        {view === 'gradient' && <Inspector />}
        {view === 'horizon' && <HorizonInspector />}
        {view === 'interface' && <InterfaceInspector />}
        {view === 'poster' && <PosterInspector />}
      </aside>
      <nav className="mobile-nav">
        {(['library', 'canvas', 'inspector'] as MobilePane[]).map((p) => (
          <button key={p} className={pane === p ? 'on' : ''} onClick={() => setPane(p)}>
            {p === 'canvas' ? 'CANVAS' : p === 'library' ? 'LIBRARY' : 'EDIT'}
          </button>
        ))}
      </nav>
      {exportOpen && <ExportDialog />}
      {remixOpen && <RemixDialog />}
      {welcomeOpen && <Welcome />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/** Studio entry points: shared "#g=" links and "?describe=" from the landing page. */
function useIncomingLinks() {
  useEffect(() => {
    const s = useStore.getState();
    const shared = gradientFromHash(location.hash);
    if (shared) {
      s.load(shared);
      s.set({ welcomeOpen: false });
    }
    const describe = new URLSearchParams(location.search).get('describe');
    if (describe) {
      s.set({ pendingPrompt: describe.slice(0, 200), welcomeOpen: false });
      s.setLeftTab('describe');
    }
    if (shared || describe) history.replaceState(null, '', '/studio');
  }, []);
}

function ShareButton() {
  const [busy, setBusy] = useState(false);
  const share = () =>
    requireAccount(async () => {
      setBusy(true);
      try {
        await publish(useStore.getState().gradient);
        useStore.getState().notify('SHARED TO THE COMMUNITY ✓');
      } catch (e) {
        useStore.getState().notify(`SHARE FAILED · ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    });
  if (!accountsEnabled) return null;
  return (
    <button onClick={share} disabled={busy} title="Post this gradient to the community wall">
      {busy ? 'SHARING…' : 'SHARE'}
    </button>
  );
}

function Account() {
  const session = useAuth((s) => s.session);
  if (!accountsEnabled) return null;
  return session ? (
    <button onClick={() => confirmSignOut()} title={`Signed in as ${session.user.email}. Click to sign out.`}>
      {displayName(session).toUpperCase().slice(0, 14)}
    </button>
  ) : (
    <button onClick={() => useAuth.getState().open('signin')}>SIGN IN</button>
  );
}

function confirmSignOut() {
  // Leave the studio first so signing out doesn't bounce into the sign-in prompt.
  navigate('/');
  signOut();
}

function TopBar({ compare, setCompare }: { compare: boolean; setCompare: (v: boolean) => void }) {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const showLabels = useStore((s) => s.showLabels);
  const view = useStore((s) => s.view);
  const s = useStore.getState;
  return (
    <header className="topbar">
      <a className="brand" {...linkTo('/')} title="Back to the home page">
        <strong>ATMOS [ STUDIO ]</strong>
        <span className="muted">SKY &amp; NATURE GRADIENTS / V0.3</span>
      </a>
      <div className="actions">
        <button onClick={() => s().undo()} disabled={!canUndo} title="Undo (⌘Z)">
          UNDO
        </button>
        <button onClick={() => s().redo()} disabled={!canRedo} title="Redo (⌘⇧Z)">
          REDO
        </button>
        <span className="sep" />
        <button onClick={(e) => s().shuffle(e.shiftKey)} title="Forecast shuffle — new place, new moment. Locked colours stay. Shift-click for a completely new gradient. (R)">
          SHUFFLE
        </button>
        <button onClick={() => s().set({ remixOpen: true })} title="Six close variations">
          REMIX
        </button>
        {view === 'gradient' && (
          <>
            <button
              className={compare ? 'on' : ''}
              onPointerDown={() => setCompare(true)}
              onPointerUp={() => setCompare(false)}
              onPointerLeave={() => setCompare(false)}
              title="Hold to see the version you started from (C)"
            >
              COMPARE
            </button>
            <button className={showLabels ? 'on' : ''} onClick={() => s().set({ showLabels: !showLabels })} title="Field-note labels on the canvas">
              LABELS
            </button>
          </>
        )}
        <span className="sep" />
        <button onClick={() => s().saveProject()} title="Save to this browser (⌘S)">
          SAVE
        </button>
        <ShareButton />
        <button onClick={() => s().set({ welcomeOpen: true })} title="What is this? (?)" aria-label="Help">
          ?
        </button>
        <Account />
        <button className="primary" onClick={() => s().set({ exportOpen: true })} title="Export (E)">
          EXPORT
        </button>
      </div>
    </header>
  );
}

function RemixDialog() {
  const g = useStore((s) => s.gradient);
  const [variants, setVariants] = useState(() => remix(g));
  const close = () => useStore.getState().set({ remixOpen: false });
  return (
    <div className="sheet-backdrop center" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Remix">
        <header className="sheet-head">
          <span>REMIX · {g.name}</span>
          <span className="row tight">
            <button className="link" onClick={() => setVariants(remix(g))}>
              AGAIN
            </button>
            <button className="link" onClick={close}>
              CLOSE
            </button>
          </span>
        </header>
        <div className="remix-grid">
          {variants.map((v) => (
            <button
              key={v.id}
              className="card card-hit"
              onClick={() => {
                useStore.getState().update((d) => Object.assign(d, { ...v, id: d.id }));
                close();
              }}
            >
              <Thumb g={v} w={220} h={220} />
              <span className="card-name">{v.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function useShortcuts(setCompare: (v: boolean) => void) {
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing(e)) return;
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        s.saveProject();
        return;
      }
      if (typing(e) || mod || e.altKey) return;
      if (e.key === 'Escape') s.set({ exportOpen: false, remixOpen: false, welcomeOpen: false, selected: null });
      if (s.exportOpen || s.remixOpen || s.welcomeOpen) return;
      if (e.key === '?') s.set({ welcomeOpen: true });
      if (e.key === '/' && s.view !== 'poster') {
        e.preventDefault();
        s.setLeftTab('library');
        setTimeout(() => document.getElementById('library-search')?.focus(), 0);
      }
      const k = e.key.toLowerCase();
      if (k === 'r') s.shuffle(e.shiftKey);
      if (k === 'e') s.set({ exportOpen: true });
      if (k === 'l') s.set({ showLabels: !s.showLabels });
      if (k === 'c' && !e.repeat && s.view === 'gradient') setCompare(true);
      if (k === ' ' && s.view === 'gradient') {
        e.preventDefault();
        s.set({ playing: !s.playing });
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected && s.gradient.points.length > 2) {
        const id = s.selected;
        s.update((d) => void (d.points = d.points.filter((p) => p.id !== id)));
        s.select(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c') setCompare(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [setCompare]);
}
