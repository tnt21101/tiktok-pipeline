export function createDashboardWorkspaceRenderer(helpers) {
  const {
    ACTIVE_JOB_STATUSES,
    escapeHtml,
    formatHistoryTimestamp,
    formatJobStatusLabel,
    getAttentionJobs,
    getCreationModeForJob,
    getCreationModeLabel,
    getHistoryBrandName,
    getHistoryLabel,
    getOutputJobs,
    getPipelineLabel,
    getPublishJobs,
    getRecentFinishedJobs,
    getReviewJobs,
    getRunRowCopy,
    getStatusTone,
    getWorkflowStageCards,
    isSequenceFinalOutputJob,
    renderDetailHero,
    renderDetailStat,
    renderEmptyState,
    renderMetricCard,
    renderStageCard,
    renderWorkspaceJobCard,
    safeLinkHtml
  } = helpers;

  function getDashboardJobMeta(job) {
    return `${escapeHtml(getHistoryBrandName(job.brandId))} · ${escapeHtml(getPipelineLabel(job.pipeline))} · ${escapeHtml(getCreationModeLabel(getCreationModeForJob(job)))} · ${escapeHtml(formatHistoryTimestamp(job.createdAt))}`;
  }

  function renderDashboardJobCard(job, options = {}) {
    const selected = Boolean(options.selected);
    const meta = options.metaSuffix
      ? `${getDashboardJobMeta(job)} · ${escapeHtml(options.metaSuffix)}`
      : getDashboardJobMeta(job);
    return renderWorkspaceJobCard({
      title: escapeHtml(getHistoryLabel(job)),
      meta,
      copy: escapeHtml(getRunRowCopy(job)),
      statusLabel: escapeHtml(formatJobStatusLabel(job.status)),
      statusTone: getStatusTone(job.status),
      selected,
      actions: options.actions || []
    });
  }

  function buildOverviewScreen({ jobs = [], counts }) {
    const safeCounts = counts || {
      active: 0,
      failed: 0,
      ready: 0,
      published: 0
    };
    const attentionJobs = getAttentionJobs(jobs, ACTIVE_JOB_STATUSES).slice(0, 4);
    const readyJobs = getReviewJobs(jobs).slice(0, 4);
    const outputJobs = getRecentFinishedJobs(jobs, 4);

    return {
      metricsHtml: [
        renderMetricCard({
          eyebrow: "Active Queue",
          value: String(safeCounts.active),
          label: "Runs currently moving through creation or generation.",
          tone: safeCounts.active > 0 ? "warning" : "neutral"
        }),
        renderMetricCard({
          eyebrow: "Failed",
          value: String(safeCounts.failed),
          label: "Jobs needing a retry, fix, or operator attention.",
          tone: safeCounts.failed > 0 ? "danger" : "neutral"
        }),
        renderMetricCard({
          eyebrow: "Ready",
          value: String(safeCounts.ready),
          label: "Completed outputs waiting for outputs, captions, or publish steps.",
          tone: safeCounts.ready > 0 ? "success" : "neutral"
        }),
        renderMetricCard({
          eyebrow: "Published",
          value: String(safeCounts.published),
          label: "Outputs that successfully reached distribution channels.",
          tone: safeCounts.published > 0 ? "success" : "neutral"
        })
      ].join(""),
      stagesHtml: getWorkflowStageCards(jobs, ACTIVE_JOB_STATUSES)
        .map((item) => renderStageCard({
          label: escapeHtml(item.label),
          value: escapeHtml(item.value),
          copy: escapeHtml(item.copy)
        }))
        .join(""),
      attentionHtml: attentionJobs.length > 0
        ? attentionJobs.map((job) => renderDashboardJobCard(job, {
          actions: [
            `<button type="button" class="secondary-button compact-button" onclick="focusDashboardJob('${job.id}', 'queue')">Open in queue</button>`
          ]
        })).join("")
        : renderEmptyState({
          title: "No jobs need intervention.",
          body: "Failures and active bottlenecks will surface here as soon as the queue changes."
        }),
      readyHtml: readyJobs.length > 0
        ? readyJobs.map((job) => renderDashboardJobCard(job, {
          actions: [
            `<button type="button" class="secondary-button compact-button" onclick="loadJobIntoSingleView('${job.id}')">Open workflow</button>`
          ]
        })).join("")
        : renderEmptyState({
          title: "Nothing is waiting in the workflow.",
          body: "Drafts, staged assets, and ready outputs will appear here when a run reaches its next step."
        }),
      outputsHtml: outputJobs.length > 0
        ? outputJobs.map((job) => renderDashboardJobCard(job, {
          actions: [
            `<button type="button" class="secondary-button compact-button" onclick="focusDashboardJob('${job.id}', 'outputs')">Inspect output</button>`
          ]
        })).join("")
        : renderEmptyState({
          title: "No finished outputs yet.",
          body: "Completed videos and sequence renders will appear here once the current workspace finishes a run."
        })
    };
  }

  function buildReviewWorkspace({ jobs = [], selectedJob = null }) {
    return {
      toolbarCopy: jobs.length > 0
        ? `${jobs.length} job${jobs.length === 1 ? "" : "s"} waiting on review or approval.`
        : "No jobs currently need review.",
      listHtml: jobs.length > 0
        ? jobs.map((job) => renderDashboardJobCard(job, {
          selected: selectedJob?.id === job.id,
          actions: [
            `<button type="button" class="secondary-button compact-button" onclick="setDashboardFocus('review', '${job.id}')">Focus review</button>`,
            `<button type="button" class="ghost-button compact-button" onclick="loadJobIntoSingleView('${job.id}')">Open in Create</button>`
          ]
        })).join("")
        : renderEmptyState({
          title: "Review queue is clear.",
          body: "Ready drafts, narration gates, and caption packages will appear here when operator action is required."
        }),
      summaryHtml: selectedJob
        ? renderDetailHero({
          eyebrow: "Review Focus",
          title: escapeHtml(getHistoryLabel(selectedJob)),
          statusLabel: escapeHtml(formatJobStatusLabel(selectedJob.status)),
          statusTone: getStatusTone(selectedJob.status),
          copy: escapeHtml(getRunRowCopy(selectedJob)),
          actions: [
            `<button type="button" class="primary-button compact-button" onclick="loadJobIntoSingleView('${selectedJob.id}')">Open in Create</button>`,
            `<button type="button" class="secondary-button compact-button" onclick="focusDashboardJob('${selectedJob.id}', 'publish')">Open publish gate</button>`
          ],
          stats: [
            renderDetailStat({ label: "Brand", value: escapeHtml(getHistoryBrandName(selectedJob.brandId)) }),
            renderDetailStat({ label: "Pipeline", value: escapeHtml(getPipelineLabel(selectedJob.pipeline)) }),
            renderDetailStat({ label: "Mode", value: escapeHtml(getCreationModeLabel(getCreationModeForJob(selectedJob))) }),
            renderDetailStat({ label: "Updated", value: escapeHtml(formatHistoryTimestamp(selectedJob.updatedAt || selectedJob.createdAt)) })
          ]
        })
        : renderEmptyState({
          title: "No selected review job.",
          body: "Choose a job from the review queue to load its scripts, captions, or narration editing panels."
        })
    };
  }

  function buildOutputsWorkspace({ jobs = [], selectedJob = null }) {
    return {
      toolbarCopy: jobs.length > 0
        ? `${jobs.length} output${jobs.length === 1 ? "" : "s"} available to inspect.`
        : "No completed outputs are available yet.",
      listHtml: jobs.length > 0
        ? jobs.map((job) => renderDashboardJobCard(job, {
          selected: selectedJob?.id === job.id,
          actions: [
            `<button type="button" class="secondary-button compact-button" onclick="setDashboardFocus('output', '${job.id}')">Focus output</button>`,
            job.videoUrl ? safeLinkHtml(job.videoUrl, "Open video", { className: "ghost-button compact-button" }) : ""
          ].filter(Boolean)
        })).join("")
        : renderEmptyState({
          title: "No outputs yet.",
          body: "Finished videos, stitched sequences, and final assets will populate here once runs complete."
        }),
      summaryHtml: selectedJob
        ? renderDetailHero({
          eyebrow: "Output Detail",
          title: escapeHtml(getHistoryLabel(selectedJob)),
          statusLabel: escapeHtml(formatJobStatusLabel(selectedJob.status)),
          statusTone: getStatusTone(selectedJob.status),
          copy: escapeHtml(selectedJob.videoUrl ? "Preview the render below, inspect the metadata, then jump to publish when it is approved." : getRunRowCopy(selectedJob)),
          actions: [
            selectedJob.videoUrl ? safeLinkHtml(selectedJob.videoUrl, "Open video", { className: "primary-button compact-button" }) : "",
            `<button type="button" class="secondary-button compact-button" onclick="focusDashboardJob('${selectedJob.id}', 'publish')">Open publish gate</button>`
          ].filter(Boolean),
          stats: [
            renderDetailStat({ label: "Brand", value: escapeHtml(getHistoryBrandName(selectedJob.brandId)) }),
            renderDetailStat({ label: "Pipeline", value: escapeHtml(getPipelineLabel(selectedJob.pipeline)) }),
            renderDetailStat({ label: "Mode", value: escapeHtml(getCreationModeLabel(getCreationModeForJob(selectedJob))) }),
            renderDetailStat({ label: "Created", value: escapeHtml(formatHistoryTimestamp(selectedJob.createdAt)) })
          ]
        })
        : renderEmptyState({
          title: "No selected output.",
          body: "Pick a finished asset to inspect its preview, sequence state, and supporting metadata."
        }),
      metadataHtml: selectedJob
        ? [
          renderDetailStat({
            label: "Script",
            value: escapeHtml((selectedJob.script || "No script stored yet.").slice(0, 180)),
            copy: selectedJob.script ? "Latest generated script excerpt." : "Nothing has been saved for this output yet."
          }),
          renderDetailStat({
            label: "Prompt",
            value: escapeHtml((selectedJob.videoPrompt || "No video prompt stored yet.").slice(0, 180)),
            copy: selectedJob.videoPrompt ? "Current prompt excerpt." : "Prompt details are unavailable for this output."
          }),
          renderDetailStat({
            label: "Model",
            value: escapeHtml(selectedJob.providerConfig?.generationConfig?.label || "No model recorded"),
            copy: "Recorded generation model for this output."
          }),
          renderDetailStat({
            label: "Distribution",
            value: escapeHtml(selectedJob.distribution?.results?.length ? "Distribution history available" : "Not yet distributed"),
            copy: "Final delivery status for connected channels."
          })
        ].join("")
        : ""
    };
  }

  function buildPublishWorkspace({ jobs = [], selectedJob = null }) {
    return {
      toolbarCopy: jobs.length > 0
        ? `${jobs.length} output${jobs.length === 1 ? "" : "s"} currently eligible for distribution.`
        : "Nothing is publish-ready yet.",
      listHtml: jobs.length > 0
        ? jobs.map((job) => renderDashboardJobCard(job, {
          selected: selectedJob?.id === job.id,
          actions: [
            `<button type="button" class="secondary-button compact-button" onclick="setDashboardFocus('publish', '${job.id}')">Focus publish</button>`,
            `<button type="button" class="ghost-button compact-button" onclick="loadJobIntoSingleView('${job.id}')">Open in Create</button>`
          ]
        })).join("")
        : renderEmptyState({
          title: "Nothing is ready to publish.",
          body: "Completed outputs will appear here once rendering and workflow packaging are complete."
        }),
      summaryHtml: selectedJob
        ? renderDetailHero({
          eyebrow: "Publish Gate",
          title: escapeHtml(getHistoryLabel(selectedJob)),
          statusLabel: escapeHtml(formatJobStatusLabel(selectedJob.status)),
          statusTone: getStatusTone(selectedJob.status),
          copy: escapeHtml(selectedJob.status === "distributed"
            ? "This output already has distribution activity recorded. Inspect destination results below or distribute again if needed."
            : "Inspect captions, confirm destination modes, and distribute from the panel below."),
          actions: [
            selectedJob.videoUrl ? safeLinkHtml(selectedJob.videoUrl, "Open video", { className: "primary-button compact-button" }) : "",
            `<button type="button" class="secondary-button compact-button" onclick="setViewMode('queue', document.getElementById('view-queue'))">Back to queue</button>`
          ].filter(Boolean),
          stats: [
            renderDetailStat({ label: "Brand", value: escapeHtml(getHistoryBrandName(selectedJob.brandId)) }),
            renderDetailStat({ label: "Pipeline", value: escapeHtml(getPipelineLabel(selectedJob.pipeline)) }),
            renderDetailStat({ label: "Status", value: escapeHtml(formatJobStatusLabel(selectedJob.status)) }),
            renderDetailStat({ label: "Created", value: escapeHtml(formatHistoryTimestamp(selectedJob.createdAt)) })
          ]
        })
        : renderEmptyState({
          title: "No selected publish job.",
          body: "Choose a publish-ready output to load its distribution settings and results."
        })
    };
  }

  function buildHistorySidebar({ jobs = [], deletingJobId = "" }) {
    if (!jobs.length) {
      return `<div class="history-empty">No recent runs yet.</div>`;
    }

    return jobs.map((job) => renderDashboardJobCard(job, {
      actions: [
        job.videoUrl ? safeLinkHtml(job.videoUrl, "Open video", { className: "ghost-button compact-button" }) : "",
        `<button type="button" class="ghost-button compact-button" onclick="loadJobIntoSingleView('${job.id}')">View details</button>`,
        `<button type="button" class="ghost-button compact-button history-delete-button" onclick="deleteHistoryJob('${job.id}')" ${deletingJobId === job.id ? "disabled" : ""}>${deletingJobId === job.id ? "Deleting..." : "Delete"}</button>`
      ].filter(Boolean)
    })).join("");
  }

  function buildRunsOverview({ counts }) {
    const safeCounts = counts || {
      active: 0,
      failed: 0,
      ready: 0,
      published: 0
    };
    const cards = [
      ["Active queue", safeCounts.active, "Rendering, queued, or still being processed."],
      ["Failed", safeCounts.failed, "Need retry, deletion, or inspection."],
      ["Ready", safeCounts.ready, "Available for outputs, captions, and publish steps."],
      ["Published", safeCounts.published, "Successfully distributed to channels."]
    ];

    return cards.map(([label, value, copy]) => `
      <div class="runs-stat">
        <div class="runs-stat-label">${escapeHtml(label)}</div>
        <div class="runs-stat-value">${escapeHtml(value)}</div>
        <div class="runs-stat-copy">${escapeHtml(copy)}</div>
      </div>
    `).join("");
  }

  function buildRunsFilters({ filters = [], activeFilterId = "", getCount }) {
    return filters.map((filter) => `
      <button
        type="button"
        class="filter-chip ${activeFilterId === filter.id ? "is-active" : ""}"
        aria-pressed="${activeFilterId === filter.id ? "true" : "false"}"
        onclick="setRunsFilter('${filter.id}')"
      >
        ${escapeHtml(filter.label)} (${getCount(filter.id)})
      </button>
    `).join("");
  }

  function buildRunsList({ jobs = [] }) {
    if (!jobs.length) {
      return {
        toolbarCopy: "No runs match the current filter.",
        listHtml: `<div class="history-empty">Nothing is in this state right now.</div>`
      };
    }

    return {
      toolbarCopy: `${jobs.length} run${jobs.length === 1 ? "" : "s"} match the current filter.`,
      listHtml: jobs.map((job) => {
        const modelLabel = job.providerConfig?.generationConfig?.label || "No model recorded";
        const slideCount = Number.parseInt(job.fields?.slideCount, 10) || 0;
        const segmentCount = Number.parseInt(job.fields?.segmentCount, 10) || 0;
        const sequenceCount = Number.parseInt(job.fields?.sequenceCount, 10) || 1;
        const isFinalSequence = isSequenceFinalOutputJob(job);
        const sourceSegments = Number.parseInt(job.fields?.sequenceSourceSegments, 10) || sequenceCount;
        const safeSegmentCount = segmentCount > 0 ? segmentCount : 1;
        const itemCountLabel = isFinalSequence
          ? `${sourceSegments} clip${sourceSegments === 1 ? "" : "s"} stitched`
          : job.mode === "slides"
            ? `${slideCount} slide${slideCount === 1 ? "" : "s"}`
            : job.mode === "narrated"
              ? `${safeSegmentCount} part${safeSegmentCount === 1 ? "" : "s"}`
              : `${sequenceCount} clip${sequenceCount === 1 ? "" : "s"}`;

        return renderDashboardJobCard(job, {
          metaSuffix: `${modelLabel} · ${itemCountLabel}`,
          actions: [
            job.videoUrl ? safeLinkHtml(job.videoUrl, "Open video", { className: "copy-button compact-button" }) : "",
            `<button type="button" class="ghost-button compact-button" onclick="loadJobIntoSingleView('${job.id}')">Open in Create</button>`,
            job.canRetry ? `<button type="button" class="secondary-button compact-button" onclick="retryRunFromList('${job.id}')">Retry</button>` : "",
            `<button type="button" class="ghost-button compact-button history-delete-button" onclick="deleteHistoryJob('${job.id}')">Delete</button>`
          ].filter(Boolean)
        });
      }).join("")
    };
  }

  return {
    buildHistorySidebar,
    buildOverviewScreen,
    buildOutputsWorkspace,
    buildPublishWorkspace,
    buildReviewWorkspace,
    buildRunsFilters,
    buildRunsList,
    buildRunsOverview,
    renderDashboardJobCard
  };
}
