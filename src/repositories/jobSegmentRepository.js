const { randomUUID } = require("node:crypto");

function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    jobId: row.job_id,
    segmentIndex: row.segment_index,
    text: row.text,
    visualIntent: row.visual_intent,
    estimatedSeconds: Number(row.estimated_seconds || 0),
    actualDurationSeconds: row.actual_duration_seconds === null ? null : Number(row.actual_duration_seconds),
    shotType: row.shot_type,
    sourceStrategy: row.source_strategy,
    voiceStatus: row.voice_status,
    voiceTaskId: row.voice_task_id,
    audioUrl: row.audio_url,
    brollPrompt: row.broll_prompt,
    brollStatus: row.broll_status,
    brollTaskId: row.broll_task_id,
    videoUrl: row.video_url,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createJobSegmentRepository(db) {
  return {
    createMany(jobId, segments = []) {
      const now = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO job_segments (
          id, job_id, segment_index, text, visual_intent, estimated_seconds, actual_duration_seconds,
          shot_type, source_strategy, voice_status, voice_task_id, audio_url, broll_prompt, broll_status,
          broll_task_id, video_url, error, created_at, updated_at
        ) VALUES (
          :id, :jobId, :segmentIndex, :text, :visualIntent, :estimatedSeconds, :actualDurationSeconds,
          :shotType, :sourceStrategy, :voiceStatus, :voiceTaskId, :audioUrl, :brollPrompt, :brollStatus,
          :brollTaskId, :videoUrl, :error, :createdAt, :updatedAt
        )
      `);

      for (const [index, segment] of segments.entries()) {
        insert.run({
          id: segment.id || randomUUID(),
          jobId,
          segmentIndex: Number.isFinite(Number(segment.segmentIndex)) ? Number(segment.segmentIndex) : index + 1,
          text: String(segment.text || "").trim(),
          visualIntent: String(segment.visualIntent || "").trim(),
          estimatedSeconds: Number(segment.estimatedSeconds || 0),
          actualDurationSeconds: segment.actualDurationSeconds ?? null,
          shotType: String(segment.shotType || "").trim(),
          sourceStrategy: String(segment.sourceStrategy || "").trim(),
          voiceStatus: String(segment.voiceStatus || "waiting").trim(),
          voiceTaskId: segment.voiceTaskId || null,
          audioUrl: segment.audioUrl || null,
          brollPrompt: segment.brollPrompt || null,
          brollStatus: String(segment.brollStatus || "waiting").trim(),
          brollTaskId: segment.brollTaskId || null,
          videoUrl: segment.videoUrl || null,
          error: segment.error || null,
          createdAt: now,
          updatedAt: now
        });
      }

      return this.listByJobId(jobId);
    },

    listByJobId(jobId) {
      const rows = db.prepare(`
        SELECT * FROM job_segments
        WHERE job_id = ?
        ORDER BY segment_index ASC, created_at ASC
      `).all(jobId);

      return rows.map(mapRow);
    },

    listByBrollStatuses(statuses = []) {
      if (!Array.isArray(statuses) || statuses.length === 0) {
        return [];
      }

      const placeholders = statuses.map((_, index) => `:status${index}`).join(", ");
      const params = Object.fromEntries(statuses.map((status, index) => [`status${index}`, status]));
      const rows = db.prepare(`
        SELECT * FROM job_segments
        WHERE broll_status IN (${placeholders})
        ORDER BY updated_at ASC, created_at ASC
      `).all(params);

      return rows.map(mapRow);
    },

    getById(id) {
      const row = db.prepare("SELECT * FROM job_segments WHERE id = ?").get(id);
      return mapRow(row);
    },

    update(id, patch = {}) {
      const serialized = {
        segmentIndex: patch.segmentIndex,
        text: patch.text,
        visualIntent: patch.visualIntent,
        estimatedSeconds: patch.estimatedSeconds,
        actualDurationSeconds: patch.actualDurationSeconds,
        shotType: patch.shotType,
        sourceStrategy: patch.sourceStrategy,
        voiceStatus: patch.voiceStatus,
        voiceTaskId: patch.voiceTaskId,
        audioUrl: patch.audioUrl,
        brollPrompt: patch.brollPrompt,
        brollStatus: patch.brollStatus,
        brollTaskId: patch.brollTaskId,
        videoUrl: patch.videoUrl,
        error: patch.error
      };

      const columnMap = {
        segmentIndex: "segment_index",
        text: "text",
        visualIntent: "visual_intent",
        estimatedSeconds: "estimated_seconds",
        actualDurationSeconds: "actual_duration_seconds",
        shotType: "shot_type",
        sourceStrategy: "source_strategy",
        voiceStatus: "voice_status",
        voiceTaskId: "voice_task_id",
        audioUrl: "audio_url",
        brollPrompt: "broll_prompt",
        brollStatus: "broll_status",
        brollTaskId: "broll_task_id",
        videoUrl: "video_url",
        error: "error"
      };

      const entries = Object.entries(serialized).filter(([, value]) => value !== undefined);
      if (entries.length === 0) {
        return this.getById(id);
      }

      const assignments = [];
      const params = {
        id,
        updatedAt: new Date().toISOString()
      };

      for (const [key, value] of entries) {
        assignments.push(`${columnMap[key]} = :${key}`);
        params[key] = value;
      }

      assignments.push("updated_at = :updatedAt");
      db.prepare(`UPDATE job_segments SET ${assignments.join(", ")} WHERE id = :id`).run(params);
      return this.getById(id);
    },

    replaceForJob(jobId, segments = []) {
      db.prepare("DELETE FROM job_segments WHERE job_id = ?").run(jobId);
      return this.createMany(jobId, segments);
    },

    deleteByJobId(jobId) {
      db.prepare("DELETE FROM job_segments WHERE job_id = ?").run(jobId);
    }
  };
}

module.exports = {
  createJobSegmentRepository
};
