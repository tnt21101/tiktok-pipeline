export function renderEmptyState({ title, body }) {
  return `
    <div class="empty-state">
      <strong>${title}</strong>
      <div>${body}</div>
    </div>
  `;
}

export function renderMetricCard({ eyebrow, value, label, meta = "", tone = "neutral" }) {
  return `
    <article class="metric-card" data-tone="${tone}">
      <div class="section-label">${eyebrow}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-label">${label}</div>
      ${meta ? `<div class="metric-meta">${meta}</div>` : ""}
    </article>
  `;
}

export function renderStageCard({ label, value, copy }) {
  return `
    <article class="stage-card">
      <div class="section-label">${label}</div>
      <div class="stage-card-value">${value}</div>
      <div class="metric-label">${copy}</div>
    </article>
  `;
}

export function renderWorkspaceJobCard({
  title,
  meta,
  copy,
  statusLabel,
  statusTone,
  selected = false,
  actions = []
}) {
  return `
    <article class="workspace-job ${selected ? "is-selected" : ""}">
      <div class="workspace-job-head">
        <div class="workspace-job-title">${title}</div>
        <span class="status-chip" data-status="${statusTone}">${statusLabel}</span>
      </div>
      ${meta ? `<div class="workspace-job-meta">${meta}</div>` : ""}
      ${copy ? `<div class="workspace-job-copy">${copy}</div>` : ""}
      ${actions.length > 0 ? `<div class="workspace-job-actions">${actions.join("")}</div>` : ""}
    </article>
  `;
}

export function renderDetailHero({
  eyebrow,
  title,
  statusLabel,
  statusTone,
  copy,
  actions = [],
  stats = []
}) {
  return `
    <section class="detail-hero">
      <div class="detail-hero-head">
        <div>
          <div class="section-label">${eyebrow}</div>
          <div class="detail-hero-title">${title}</div>
        </div>
        <span class="status-chip" data-status="${statusTone}">${statusLabel}</span>
      </div>
      ${copy ? `<div class="detail-hero-copy">${copy}</div>` : ""}
      ${stats.length > 0 ? `<div class="detail-meta-grid">${stats.join("")}</div>` : ""}
      ${actions.length > 0 ? `<div class="detail-hero-actions">${actions.join("")}</div>` : ""}
    </section>
  `;
}

export function renderDetailStat({ label, value, copy = "" }) {
  return `
    <div class="detail-stat">
      <div class="detail-stat-label">${label}</div>
      <div class="detail-stat-value">${value}</div>
      ${copy ? `<div class="detail-stat-copy">${copy}</div>` : ""}
    </div>
  `;
}
