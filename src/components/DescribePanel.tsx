// Experimental: describe a scene or mood in words, get a gradient.
import { useEffect, useRef, useState } from 'react';
import { MAX_PROMPT } from '../lib/aiSchema';
import { generateFromText, type TextResult } from '../lib/textGradient';
import { useStore } from '../store';
import { Thumb } from './Thumb';

const EXAMPLES = ['Tokyo rain at 2am', 'Iceland glacier at first light', '80s Miami sunset', 'Moss after a storm', 'Lavender field, heat haze', 'Deep sea bioluminescence'];

export function DescribePanel() {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<(TextResult & { prompt: string })[]>([]);
  const abort = useRef<AbortController | null>(null);

  const run = async (text = prompt) => {
    const p = text.trim();
    if (!p || busy) return;
    setPrompt(p);
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const r = await generateFromText(p, abort.current.signal);
      useStore.getState().load(r.gradient);
      setHistory((h) => [{ ...r, prompt: p }, ...h].slice(0, 8));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A description typed on the landing page runs as soon as the studio opens.
  useEffect(() => {
    const p = useStore.getState().pendingPrompt;
    if (p) {
      useStore.getState().set({ pendingPrompt: null });
      run(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = history[0];

  return (
    <div className="pad stack">
      <div className="exp-tag">EXPERIMENTAL · AI</div>
      <p className="hint">Describe a place, a moment or a mood. Claude picks the colours, the place and the time.</p>
      <form
        className="describe"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <textarea
          id="describe-prompt"
          value={prompt}
          maxLength={MAX_PROMPT}
          rows={3}
          placeholder="e.g. Tokyo rain at 2am, neon on wet asphalt"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              run();
            }
          }}
          aria-label="Describe a gradient"
        />
        <div className="describe-row">
          <span className="muted tiny">
            {prompt.length}/{MAX_PROMPT}
          </span>
          {busy ? (
            <button type="button" className="btn ghost" onClick={() => abort.current?.abort()}>
              CANCEL
            </button>
          ) : (
            <button type="submit" className="btn" disabled={!prompt.trim()}>
              GENERATE
            </button>
          )}
        </div>
      </form>
      {busy && <div className="describe-busy">READING THE SKY…</div>}
      {error && <p className="error-text">{error}</p>}
      <div className="chips">
        {EXAMPLES.map((x) => (
          <button key={x} className="chip" disabled={busy} onClick={() => run(x)}>
            {x.toUpperCase()}
          </button>
        ))}
      </div>

      {latest && (
        <div className="describe-result">
          <div className="collection-head">
            <span>{latest.gradient.name}</span>
            <span className="muted">{latest.source === 'ai' ? 'BY CLAUDE' : 'BUILT-IN'}</span>
          </div>
          {latest.note && <p className="collection-blurb">{latest.note}</p>}
          {latest.notice && <p className="hint warn">{latest.notice}</p>}
          <button className="btn ghost wide" disabled={busy} onClick={() => run(latest.prompt)}>
            TRY AGAIN
          </button>
        </div>
      )}

      {history.length > 1 && (
        <>
          <div className="collection-head">
            <span>THIS SESSION</span>
            <span className="muted">{history.length}</span>
          </div>
          <div className="grid">
            {history.slice(1).map((h) => (
              <button key={h.gradient.id} className="card card-hit" onClick={() => useStore.getState().load(h.gradient)} title={h.prompt}>
                <Thumb g={h.gradient} />
                <span className="card-name">{h.gradient.name}</span>
                <span className="card-place">{h.prompt.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
