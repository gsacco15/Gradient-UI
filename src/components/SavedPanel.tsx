// Saved projects (stored in this browser) + JSON import.
import { useRef } from 'react';
import { hydrateGradient } from '../lib/gradient';
import { useStore } from '../store';
import { Thumb } from './Thumb';

export function SavedPanel() {
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const file = useRef<HTMLInputElement>(null);

  const importJSON = async (f?: File | null) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const g = hydrateGradient(data.gradient ?? data);
      useStore.getState().load(g);
      useStore.getState().set({ projectId: null });
      useStore.getState().notify(`IMPORTED · ${g.name}`);
    } catch {
      useStore.getState().notify('NOT A VALID ATMOS PROJECT');
    }
  };

  return (
    <div className="pad stack">
      <div className="row">
        <button className="btn" onClick={() => { useStore.getState().set({ projectId: null }); useStore.getState().saveProject(); }}>
          SAVE AS NEW
        </button>
        <button className="btn ghost" onClick={() => file.current?.click()}>
          IMPORT JSON
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => importJSON(e.target.files?.[0])} />
      </div>
      {!projects.length && <p className="hint">Nothing saved yet. Press SAVE in the top bar — projects stay in this browser.</p>}
      <ul className="projects">
        {projects.map((p) => (
          <li key={p.id} className={p.id === projectId ? 'current' : ''}>
            <button
              className="proj-open"
              onClick={() => {
                useStore.getState().load(p.gradient, true);
                useStore.getState().set({ projectId: p.id });
              }}
            >
              <Thumb g={p.gradient} w={64} h={64} />
            </button>
            <div className="proj-text">
              <input
                className="proj-title"
                defaultValue={p.title}
                onBlur={(e) => e.target.value.trim() && useStore.getState().renameProject(p.id, e.target.value.trim())}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                aria-label="Project name"
              />
              <span className="muted tiny">{new Date(p.updated).toLocaleString()}</span>
              <div className="row tight">
                <button className="link" onClick={() => useStore.getState().duplicateProject(p.id)}>
                  DUPLICATE
                </button>
                <button className="link" onClick={() => confirm(`Delete “${p.title}”?`) && useStore.getState().deleteProject(p.id)}>
                  DELETE
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
