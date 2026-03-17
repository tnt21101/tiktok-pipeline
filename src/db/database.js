const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const defaultBrands = require("../brands");

function migrate(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      voice TEXT NOT NULL,
      products TEXT NOT NULL,
      target_audience TEXT NOT NULL,
      tone TEXT NOT NULL,
      platforms_json TEXT NOT NULL,
      social_accounts_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL,
      pipeline TEXT NOT NULL,
      fields_json TEXT NOT NULL,
      source_image_url TEXT NOT NULL,
      status TEXT NOT NULL,
      analysis TEXT,
      script TEXT,
      video_prompt TEXT,
      provider_task_id TEXT,
      video_url TEXT,
      captions_json TEXT,
      distribution_json TEXT,
      error TEXT,
      provider_config_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    );

    CREATE TABLE IF NOT EXISTS brand_products (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL,
      asin TEXT NOT NULL,
      marketplace TEXT NOT NULL DEFAULT 'com',
      title TEXT NOT NULL,
      product_url TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      gallery_json TEXT NOT NULL DEFAULT '[]',
      benefits_json TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      source_data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      UNIQUE (brand_id, asin)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_provider_task_id ON jobs(provider_task_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_image_pipeline ON jobs(source_image_url, pipeline);
    CREATE INDEX IF NOT EXISTS idx_brand_products_brand ON brand_products(brand_id);
  `);

  const brandColumns = db.prepare("PRAGMA table_info(brands)").all();
  const hasSocialAccountsColumn = brandColumns.some((column) => column.name === "social_accounts_json");
  if (!hasSocialAccountsColumn) {
    db.exec("ALTER TABLE brands ADD COLUMN social_accounts_json TEXT NOT NULL DEFAULT '{}'");
  }
}

function seedBrands(db, logger) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM brands").get().count;
  if (count > 0) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO brands (
      id, name, category, voice, products, target_audience, tone, platforms_json, social_accounts_json, created_at, updated_at
    ) VALUES (
      :id, :name, :category, :voice, :products, :targetAudience, :tone, :platformsJson, :socialAccountsJson, :createdAt, :updatedAt
    )
  `);

  const now = new Date().toISOString();
  for (const brand of defaultBrands) {
    insert.run({
      id: brand.id,
      name: brand.name,
      category: brand.category,
      voice: brand.voice,
      products: brand.products,
      targetAudience: brand.targetAudience,
      tone: brand.tone,
      platformsJson: JSON.stringify(brand.platforms || []),
      socialAccountsJson: JSON.stringify(brand.socialAccounts || {}),
      createdAt: now,
      updatedAt: now
    });
  }

  logger.info("brands_seeded", { count: defaultBrands.length });
}

function seedSettings(db) {
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    roles: {
      "agent/1": "Pipeline Core",
      "agent/2": "Frontend Workflow",
      "agent/3": "Distribution",
      "agent/4": "QA/Ops"
    }
  });

  db.prepare(`
    INSERT OR IGNORE INTO settings (key, value_json, updated_at)
    VALUES ('agent_command_roles', :valueJson, :updatedAt)
  `).run({
    valueJson: payload,
    updatedAt: now
  });
}

function createDatabase(config, logger) {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });

  const db = new DatabaseSync(config.databasePath);
  migrate(db);
  seedBrands(db, logger);
  seedSettings(db);
  return db;
}

module.exports = {
  createDatabase
};
