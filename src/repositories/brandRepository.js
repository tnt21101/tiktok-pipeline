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
    socialAccounts: JSON.parse(row.social_accounts_json || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSocialAccounts(input = {}) {
  return {
    ayrshareProfileKey: String(input.ayrshareProfileKey || "").trim(),
    tiktokHandle: String(input.tiktokHandle || "").trim(),
    instagramHandle: String(input.instagramHandle || "").trim(),
    youtubeHandle: String(input.youtubeHandle || "").trim()
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
          : ["TikTok", "Instagram Reels", "YouTube Shorts"],
        socialAccounts: normalizeSocialAccounts(input.socialAccounts)
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
          id, name, category, voice, products, target_audience, tone, platforms_json, social_accounts_json, created_at, updated_at
        ) VALUES (
          :id, :name, :category, :voice, :products, :targetAudience, :tone, :platformsJson, :socialAccountsJson, :createdAt, :updatedAt
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
        socialAccountsJson: JSON.stringify(brand.socialAccounts),
        createdAt: now,
        updatedAt: now
      });

      return this.getById(brand.id);
    },

    update(id, input) {
      const current = this.getById(id);
      if (!current) {
        throw new AppError(404, "Brand not found.", {
          code: "brand_not_found"
        });
      }

      const next = {
        ...current,
        name: String(input.name ?? current.name).trim(),
        category: String(input.category ?? current.category).trim(),
        voice: String(input.voice ?? current.voice).trim(),
        products: String(input.products ?? current.products).trim(),
        targetAudience: String(input.targetAudience ?? current.targetAudience).trim(),
        tone: String(input.tone ?? current.tone).trim(),
        platforms: Array.isArray(input.platforms) && input.platforms.length > 0
          ? input.platforms
          : current.platforms,
        socialAccounts: input.socialAccounts
          ? normalizeSocialAccounts(input.socialAccounts)
          : current.socialAccounts
      };

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE brands
        SET
          name = :name,
          category = :category,
          voice = :voice,
          products = :products,
          target_audience = :targetAudience,
          tone = :tone,
          platforms_json = :platformsJson,
          social_accounts_json = :socialAccountsJson,
          updated_at = :updatedAt
        WHERE id = :id
      `).run({
        id,
        name: next.name,
        category: next.category,
        voice: next.voice,
        products: next.products,
        targetAudience: next.targetAudience,
        tone: next.tone,
        platformsJson: JSON.stringify(next.platforms),
        socialAccountsJson: JSON.stringify(next.socialAccounts),
        updatedAt: now
      });

      return this.getById(id);
    }
  };
}

module.exports = {
  createBrandRepository
};
