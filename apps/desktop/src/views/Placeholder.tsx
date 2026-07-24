export interface SectionMeta {
  title: string;
  blurb: string;
  feature: string;
  file: string;
}

/**
 * Honest wireframe-styled stand-in for a section whose feature isn't built yet.
 * Shows the screen's real purpose (from the wireframes) and which PRD feature
 * will implement it — no fabricated data.
 */
export function Placeholder({ meta }: { meta: SectionMeta }) {
  return (
    <div className="view">
      <header className="view-head">
        <h1>{meta.title}</h1>
        <p className="muted">{meta.blurb}</p>
      </header>

      <div className="preview-panel">
        <span className="preview-tag">Planned screen</span>
        <p className="preview-lead">This section isn’t built yet.</p>
        <p className="muted">Planned in {meta.feature}.</p>
        <p className="muted preview-ref">Design reference · wireframes/{meta.file}</p>
      </div>
    </div>
  );
}
