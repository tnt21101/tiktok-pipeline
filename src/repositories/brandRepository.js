const { randomUUID } = require("node:crypto");
const { AppError } = require("../utils/errors");

function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    voice: row.voice,
    products: row.products,
    targetAudience: row.target_audience,
    tone: row.tone,
    platforms: JSON.parse(row.platforms_json || "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createBrandRepository(db) {
  return {
    getAll() {
      const rows = db.prepare("SELECT * FROM brands ORDER BY name ASC").all();
      return rows.map(mapRow);
    },

    getById(id) {
      const row = db.prepare("SELECT * FROM brands WHERE id = ?").get(id);
      return mapRow(row);
    },

    create(input) {
      const now = new Date().toISOString();
      const brand = {
        id: input.id || randomUUID(),
        name: String(input.name || "").trim(),
        category: String(input.category || "").trim(),
        voice: String(input.voice || "").trim(),
        products: String(input.products || "").trim(),
        targetAudience: String(input.targetAudience || "").trim(),
        tone: String(input.tone || "").trim(),
        platforms: Array.isArray(input.platforms) && input.platforms.length > 0
          ? input.platforms
          : ["TikTok", "Instagram Reels", "YouTube Shorts"]
      };

      for (const key of ["name", "category", "voice", "products", "targetAudience", "tone"]) {
        if (!brand[key]) {
          throw new AppError(400, `Brand field "${key}" is required.`, {
            code: "invalid_brand"
          });
        }
      }

      db.prepare(`
        INSERT INTO brands (
          id, name, category, voice, products, target_audience, tone, platforms_json, created_at, updated_at
        ) VALUES (
          :id, :name, :category, :voice, :products, :targetAudience, :tone, :platformsJson, :createdAt, :updatedAt
        )
      `).run({
        id: brand.id,
        name: brand.name,
        category: brand.category,
        voice: brand.voice,
        products: brand.products,
        targetAudience: brand.targetAudience,
        tone: brand.tone,
        platformsJson: JSON.stringify(brand.platforms),
        createdAt: now,
        updatedAt: now
      });

      return this.getById(brand.id);
    }
  };
}

module.exports = {
  createBrandRepository
};
