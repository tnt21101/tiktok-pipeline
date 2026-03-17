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

  const benefits = parseJson(row.benefits_json, []);
  return {
    id: row.id,
    brandId: row.brand_id,
    asin: row.asin,
    marketplace: row.marketplace,
    title: row.title,
    productUrl: row.product_url,
    imageUrl: row.image_url,
    galleryImages: parseJson(row.gallery_json, []),
    benefits,
    primaryBenefit: benefits[0] || "",
    description: row.description || "",
    sourceData: parseJson(row.source_data_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createProductRepository(db) {
  return {
    listByBrandId(brandId) {
      const rows = db.prepare(`
        SELECT * FROM brand_products
        WHERE brand_id = ?
        ORDER BY title COLLATE NOCASE ASC, created_at DESC
      `).all(brandId);
      return rows.map(mapRow);
    },

    getById(id) {
      return mapRow(db.prepare("SELECT * FROM brand_products WHERE id = ?").get(id));
    },

    getByBrandAndAsin(brandId, asin) {
      return mapRow(db.prepare(`
        SELECT * FROM brand_products
        WHERE brand_id = ? AND asin = ?
      `).get(brandId, asin));
    },

    upsertImported(input) {
      const now = new Date().toISOString();
      const existing = this.getByBrandAndAsin(input.brandId, input.asin);
      const payload = {
        id: existing?.id || input.id || randomUUID(),
        brandId: input.brandId,
        asin: String(input.asin || "").trim().toUpperCase(),
        marketplace: String(input.marketplace || "com").trim().toLowerCase() || "com",
        title: String(input.title || input.asin || "").trim(),
        productUrl: String(input.productUrl || "").trim(),
        imageUrl: String(input.imageUrl || "").trim(),
        galleryJson: JSON.stringify(Array.isArray(input.galleryImages) ? input.galleryImages : []),
        benefitsJson: JSON.stringify(Array.isArray(input.benefits) ? input.benefits : []),
        description: String(input.description || "").trim(),
        sourceDataJson: JSON.stringify(input.sourceData || {}),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };

      db.prepare(`
        INSERT INTO brand_products (
          id, brand_id, asin, marketplace, title, product_url, image_url, gallery_json, benefits_json, description, source_data_json, created_at, updated_at
        ) VALUES (
          :id, :brandId, :asin, :marketplace, :title, :productUrl, :imageUrl, :galleryJson, :benefitsJson, :description, :sourceDataJson, :createdAt, :updatedAt
        )
        ON CONFLICT(brand_id, asin) DO UPDATE SET
          marketplace = excluded.marketplace,
          title = excluded.title,
          product_url = excluded.product_url,
          image_url = excluded.image_url,
          gallery_json = excluded.gallery_json,
          benefits_json = excluded.benefits_json,
          description = excluded.description,
          source_data_json = excluded.source_data_json,
          updated_at = excluded.updated_at
      `).run(payload);

      return this.getByBrandAndAsin(payload.brandId, payload.asin);
    },

    deleteById(brandId, productId) {
      db.prepare("DELETE FROM brand_products WHERE id = ? AND brand_id = ?").run(productId, brandId);
    }
  };
}

module.exports = {
  createProductRepository
};
