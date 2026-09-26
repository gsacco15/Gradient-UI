// First-visit introduction: what Atmos is and the three things you do with it.
import { ALL_PRESETS } from '../data/collections';
import { useStore } from '../store';
import { Thumb } from './Thumb';

const pick = (name: string) => ALL_PRESETS.find((g) => g.name === name) ?? ALL_PRESETS[0];

const STEPS = [
  { n: '1', title: 'PICK A SKY', body: 'Start from 87 field notes — dawn in Big Sur, aurora over Tromsø — or your own photo, or the real sky outside right now.', g: pick('ALPENGLOW') },
  { n: '2', title: 'SHAPE IT', body: 'Drag colours on the canvas. Add fog, grain and dither. Make it move, or react to the cursor.', g: pick('QUADRANT NEBULA') },
  { n: '3', title: 'USE IT', body: 'See it on real screens in INTERFACE, print it in POSTER, or export CSS, PNG, video and live embeds.', g: pick('SOLAR WIND') },
];

export function Welcome() {
  const close = () => useStore.getState().set({ welcomeOpen: false });
  const surprise = () => {
    const g = ALL_PRESETS[Math.floor(Math.random() * ALL_PRESETS.length)];
    useStore.getState().load(g);
    close();
  };
  return (
    <div className="sheet-backdrop center" onClick={close}>
      <div className="modal welcome" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="welcome-title">
        <header className="welcome-head">
          <span className="muted">ATMOS [ STUDIO ] · V0.2</span>
          <button className="link" onClick={close}>
            CLOSE
          </button>
        </header>
        <h2 id="welcome-title">A gradient studio where every colour is a place and a moment.</h2>
        <ol className="welcome-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Thumb g={s.g} w={240} h={180} priority />
              <span className="welcome-n">{s.n}</span>
              <strong>{s.title}</strong>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="welcome-actions">
          <button className="btn" onClick={close}>
            START CREATING
          </button>
          <button className="btn ghost" onClick={surprise}>
            SURPRISE ME
          </button>
        </div>
        <p className="hint">Tip: press R to shuffle, hold C to compare, and ⌘Z to undo. Reopen this anytime with the ? button.</p>
      </div>
    </div>
  );
}
