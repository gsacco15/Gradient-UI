// Share: publish the current gradient to a short link, optionally on the community wall.
import { useState } from 'react';
import { renderSharePreview } from '../lib/sharePreview';
import { publish, shareUrl, type SharedGradient } from '../lib/supabase';
import { useStore } from '../store';
import { Thumb } from './Thumb';

export function ShareDialog() {
  const g = useStore((s) => s.gradient);
  const close = () => useStore.getState().set({ shareOpen: false });
  const [name, setName] = useState(g.name);
  const [listed, setListed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SharedGradient | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const shared = { ...g, name: name.trim().toUpperCase().slice(0, 40) || g.name };
      const preview = await renderSharePreview(shared).catch(() => null);
      setDone(await publish(shared, { listed, preview }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const link = done ? shareUrl(done.slug) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      useStore.getState().notify('LINK COPIED');
    } catch {
      useStore.getState().notify('SELECT THE LINK TO COPY');
    }
  };
  const nativeShare = () => navigator.share?.({ title: `${done!.name} · Atmos`, text: `${done!.name} — a gradient I made in Atmos`, url: link }).catch(() => {});

  return (
    <div className="sheet-backdrop center" onClick={close}>
      <div className="modal share" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="share-title">
        <header className="sheet-head">
          <span id="share-title">{done ? 'SHARED' : 'SHARE'}</span>
          <button className="link" onClick={close}>
            CLOSE
          </button>
        </header>
        <div className="share-body">
          <Thumb g={g} w={600} h={315} className="share-preview" priority />
          {!done ? (
            <div className="stack">
              <label className="field">
                <span className="field-label">NAME</span>
                <input className="text-input" id="share-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="field">
                <span className="field-label">WHO CAN SEE IT</span>
                <div className="seg">
                  <button className={listed ? 'on' : ''} onClick={() => setListed(true)}>
                    COMMUNITY WALL + LINK
                  </button>
                  <button className={!listed ? 'on' : ''} onClick={() => setListed(false)}>
                    ONLY PEOPLE WITH THE LINK
                  </button>
                </div>
              </div>
              <p className="hint">The link opens your gradient on the Atmos home page, with every setting: motion, cursor effects, grain and all.</p>
              {error && <p className="error-text">{error}</p>}
              <button className="btn wide" onClick={create} disabled={busy}>
                {busy ? 'CREATING LINK…' : 'CREATE LINK'}
              </button>
            </div>
          ) : (
            <div className="stack">
              <p className="hint">{done.listed ? 'Posted to the community wall. Anyone with the link can open it too.' : 'Only people with this link can see it.'}</p>
              <div className="share-link">
                <input className="text-input" id="share-link" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Share link" />
                <button className="btn" onClick={copy}>
                  COPY
                </button>
              </div>
              <div className="row">
                {'share' in navigator && (
                  <button className="btn ghost" onClick={nativeShare}>
                    SHARE…
                  </button>
                )}
                <a className="btn ghost" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${done.name} — made in Atmos`)}&url=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">
                  POST ON X
                </a>
                <a className="btn ghost" href={link} target="_blank" rel="noreferrer">
                  OPEN
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
