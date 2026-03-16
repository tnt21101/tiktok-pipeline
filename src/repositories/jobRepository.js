const { randomUUID } = require("node:crypto");

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    brandId: row.brand_id,
    pipeline: row.pipeline,
    fields: parseJson(row.fields_json, {}),
    sourceImageUrl: row.source_image_url,
    status: row.status,
    analysis: row.analysis,
    script: row.script,
    videoPrompt: row.video_prompt,
    providerTaskId: row.provider_task_id,
    videoUrl: row.video_url,
    captions: parseJson(row.captions_json, null),
    distribution: parseJson(row.distribution_json, null),
    error: row.error,
    providerConfig: parseJson(row.provider_config_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

function serializePatch(patch) {
  const serialized = {
    brandId: patch.brandId,
    pipeline: patch.pipeline,
    fieldsJson: patch.fields ? JSON.stringify(patch.fields) : undefined,
    sourceImageUrl: patch.sourceImageUrl,
    status: patch.status,
    analysis: patch.analysis,
    script: patch.script,
    videoPrompt: patch.videoPrompt,
    providerTaskId: patch.providerTaskId,
    videoUrl: patch.videoUrl,
    captionsJson: patch.captions !== undefined ? JSON.stringify(patch.captions) : undefined,
    distributionJson: patch.distribution !== undefined ? JSON.stringify(patch.distribution) : undefined,
    error: patch.error,
    providerConfigJson: patch.providerConfig !== undefined ? JSON.stringify(patch.providerConfig) : undefined,
    startedAt: patch.startedAt,
    completedAt: patch.completedAt
  };

  return Object.fromEntries(Object.entries(serialized).filter(([, value]) => value !== undefined));
}

function createJobRepository(db) {
  return {
    create(input) {
      const now = new Date().toISOString();
      const id = input.id || randomUUID();

      db.prepare(`
        INSERT INTO jobs (
          id, brand_id, pipeline, fields_json, source_image_url, status, analysis, script, video_prompt,
          provider_task_id, video_url, captions_json, distribution_json, error, provider_config_json,
          created_at, updated_at, started_at, completed_at
        ) VALUES (
          :id, :brandId, :pipeline, :fieldsJson, :sourceImageUrl, :status, :analysis, :script, :videoPrompt,
          :providerTaskId, :videoUrl, :captionsJson, :distributionJson, :error, :providerConfigJson,
          :createdAt, :updatedAt, :startedAt, :completedAt
        )
      `).run({
        id,
        brandId: input.brandId,
        pipeline: input.pipeline,
        fieldsJson: JSON.stringify(input.fields || {}),
        sourceImageUrl: input.sourceImageUrl,
        status: input.status || "queued",
        analysis: input.analysis || null,
        script: input.script || null,
        videoPrompt: input.videoPrompt || null,
        providerTaskId: input.providerTaskId || null,
        videoUrl: input.videoUrl || null,
        captionsJson: input.captions ? JSON.stringify(input.captions) : null,
        distributionJson: input.distribution ? JSON.stringify(input.distribution) : null,
        error: input.error || null,
        providerConfigJson: JSON.stringify(input.providerConfig || {}),
        createdAt: now,
        updatedAt: now,
        startedAt: input.startedAt || null,
        completedAt: input.completedAt || null
      });

      return this.getById(id);
    },

    getById(id) {
      const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
      return mapRow(row);
    },

    getByProviderTaskId(taskId) {
      const row = db.prepare("SELECT * FROM jobs WHERE provider_task_id = ?").get(taskId);
      return mapRow(row);
    },

    list(filters = {}) {
      const clauses = [];
      const params = {};

      if (filters.ids && filters.ids.length > 0) {
        const placeholders = filters.ids.map((_, index) => `:id${index}`);
        clauses.push(`id IN (${placeholders.join(", ")})`);
        filters.ids.forEach((id, index) => {
          params[`id${index}`] = id;
        });
      }

      if (filters.statuses && filters.statuses.length > 0) {
        const placeholders = filters.statuses.map((_, index) => `:status${index}`);
        clauses.push(`status IN (${placeholders.join(", ")})`);
        filters.statuses.forEach((status, index) => {
          params[`status${index}`] = status;
        });
      }

      if (filters.createdAfter) {
        clauses.push("created_at >= :createdAfter");
        params.createdAfter = filters.createdAfter;
      }

      if (filters.createdBefore) {
        clauses.push("created_at < :createdBefore");
        params.createdBefore = filters.createdBefore;
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const limit = Number.isFinite(filters.limit) ? `LIMIT ${filters.limit}` : "LIMIT 100";
      const rows = db.prepare(`
        SELECT * FROM jobs
        ${where}
        ORDER BY created_at DESC
        ${limit}
      `).all(params);

      return rows.map(mapRow);
    },

    update(id, patch) {
      const values = serializePatch(patch);
      const assignments = [];
      const params = { id, updatedAt: new Date().toISOString() };

      for (const [key, value] of Object.entries(values)) {
        const column = {
          brandId: "brand_id",
          pipeline: "pipeline",
          fieldsJson: "fields_json",
          sourceImageUrl: "source_image_url",
          status: "status",
          analysis: "analysis",
          script: "script",
          videoPrompt: "video_prompt",
          providerTaskId: "provider_task_id",
          videoUrl: "video_url",
          captionsJson: "captions_json",
          distributionJson: "distribution_json",
          error: "error",
          providerConfigJson: "provider_config_json",
          startedAt: "started_at",
          completedAt: "completed_at"
        }[key];

        assignments.push(`${column} = :${key}`);
        params[key] = value;
      }

      assignments.push("updated_at = :updatedAt");
      db.prepare(`UPDATE jobs SET ${assignments.join(", ")} WHERE id = :id`).run(params);
      return this.getById(id);
    },

    getNextQueuedJob() {
      const row = db.prepare(`
        SELECT * FROM jobs
        WHERE status IN ('queued', 'retry_queued')
        ORDER BY created_at ASC
        LIMIT 1
      `).get();
      return mapRow(row);
    },

    getNextAwaitingGenerationJob() {
      const row = db.prepare(`
        SELECT * FROM jobs
        WHERE status = 'awaiting_generation'
        ORDER BY created_at ASC
        LIMIT 1
      `).get();
      return mapRow(row);
    },

    getPollingJobs() {
      const rows = db.prepare(`
        SELECT * FROM jobs
        WHERE status = 'polling'
        ORDER BY updated_at ASC
      `).all();
      return rows.map(mapRow);
    },

    findLatestAnalysis(sourceImageUrl, pipeline) {
      const row = db.prepare(`
        SELECT * FROM jobs
        WHERE source_image_url = ? AND pipeline = ? AND analysis IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(sourceImageUrl, pipeline);
      return mapRow(row);
    }
  };
}

module.exports = {
  createJobRepository
};
