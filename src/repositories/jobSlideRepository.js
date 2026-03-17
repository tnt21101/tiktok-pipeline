const { randomUUID } = require("node:crypto");

function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    jobId: row.job_id,
    slideIndex: row.slide_index,
    headline: row.headline,
    body: row.body,
    imageUrl: row.image_url,
    durationSeconds: Number(row.duration_seconds || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createJobSlideRepository(db) {
  return {
    createMany(jobId, slides = []) {
      const now = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO job_slides (
          id, job_id, slide_index, headline, body, image_url, duration_seconds, created_at, updated_at
        ) VALUES (
          :id, :jobId, :slideIndex, :headline, :body, :imageUrl, :durationSeconds, :createdAt, :updatedAt
        )
      `);

      for (const [index, slide] of slides.entries()) {
        insert.run({
          id: slide.id || randomUUID(),
          jobId,
          slideIndex: Number.isFinite(Number(slide.slideIndex)) ? Number(slide.slideIndex) : index + 1,
          headline: String(slide.headline || "").trim(),
          body: String(slide.body || "").trim(),
          imageUrl: slide.imageUrl || null,
          durationSeconds: Number(slide.durationSeconds || 0),
          createdAt: now,
          updatedAt: now
        });
      }

      return this.listByJobId(jobId);
    },

    listByJobId(jobId) {
      const rows = db.prepare(`
        SELECT * FROM job_slides
        WHERE job_id = ?
        ORDER BY slide_index ASC, created_at ASC
      `).all(jobId);

      return rows.map(mapRow);
    },

    listAll() {
      const rows = db.prepare(`
        SELECT * FROM job_slides
        ORDER BY job_id ASC, slide_index ASC, created_at ASC
      `).all();

      return rows.map(mapRow);
    },

    getById(id) {
      const row = db.prepare("SELECT * FROM job_slides WHERE id = ?").get(id);
      return mapRow(row);
    },

    update(id, patch = {}) {
      const serialized = {
        slideIndex: patch.slideIndex,
        headline: patch.headline,
        body: patch.body,
        imageUrl: patch.imageUrl,
        durationSeconds: patch.durationSeconds
      };

      const columnMap = {
        slideIndex: "slide_index",
        headline: "headline",
        body: "body",
        imageUrl: "image_url",
        durationSeconds: "duration_seconds"
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
      db.prepare(`UPDATE job_slides SET ${assignments.join(", ")} WHERE id = :id`).run(params);
      return this.getById(id);
    },

    replaceForJob(jobId, slides = []) {
      db.prepare("DELETE FROM job_slides WHERE job_id = ?").run(jobId);
      return this.createMany(jobId, slides);
    },

    deleteByJobId(jobId) {
      db.prepare("DELETE FROM job_slides WHERE job_id = ?").run(jobId);
    }
  };
}

module.exports = {
  createJobSlideRepository
};
