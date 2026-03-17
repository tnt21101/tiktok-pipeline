const path = require("node:path");

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveConfig(env = process.env) {
  const projectRoot = path.resolve(__dirname, "..");
  const publicDir = path.join(projectRoot, "public");
  const uploadsDir = path.resolve(projectRoot, env.UPLOADS_DIR || "./public/uploads");
  const outputDir = path.join(projectRoot, "output");

  return {
    nodeEnv: env.NODE_ENV || "development",
    port: parseInteger(env.PORT, 3000),
    baseUrl: env.BASE_URL || "http://localhost:3000",
    databasePath: path.resolve(projectRoot, env.DATABASE_PATH || "./data/tiktok-pipeline.sqlite"),
    publicDir,
    uploadsDir,
    outputDir,
    anthropicApiKey: env.ANTHROPIC_API_KEY || "",
    kieApiKey: env.KIEAI_API_KEY || "",
    ayrshareApiKey: env.AYRSHARE_API_KEY || "",
    falApiKey: env.FAL_KEY || env.FAL_API_KEY || "",
    jobPollIntervalMs: parseInteger(env.JOB_POLL_INTERVAL_MS, 5000),
    generationTimeoutMs: parseInteger(env.GENERATION_TIMEOUT_MS, 30 * 60 * 1000),
    maxUploadBytes: parseInteger(env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
    internalApiToken: env.INTERNAL_API_TOKEN || ""
  };
}

function isPublicBaseUrl(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    const hostname = parsed.hostname.toLowerCase();
    return !["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname);
  } catch {
    return false;
  }
}

function validateConfig(config) {
  const errors = [];
  const warnings = [];

  try {
    new URL(config.baseUrl);
  } catch {
    errors.push("BASE_URL must be a valid absolute URL.");
  }

  if (config.nodeEnv === "production" && !isPublicBaseUrl(config.baseUrl)) {
    errors.push("BASE_URL must be public in production so uploads and callbacks resolve externally.");
  } else if (!isPublicBaseUrl(config.baseUrl)) {
    warnings.push("BASE_URL points at localhost. Upload URLs and provider callbacks will only work locally.");
  }

  if (config.jobPollIntervalMs < 1000) {
    warnings.push("JOB_POLL_INTERVAL_MS below 1000ms may cause unnecessary provider polling.");
  }

  if (config.generationTimeoutMs < 60_000) {
    warnings.push("GENERATION_TIMEOUT_MS below 60000ms may prematurely fail slow video generations.");
  }

  if (!config.anthropicApiKey) {
    warnings.push("ANTHROPIC_API_KEY is not configured.");
  }

  if (!config.kieApiKey) {
    warnings.push("KIEAI_API_KEY is not configured.");
  }

  if (!config.ayrshareApiKey) {
    warnings.push("AYRSHARE_API_KEY is not configured.");
  }

  if (!config.falApiKey) {
    warnings.push("FAL_KEY is not configured. Batch category compilation will be unavailable.");
  }

  return {
    errors,
    warnings,
    baseUrlIsPublic: isPublicBaseUrl(config.baseUrl)
  };
}

module.exports = {
  resolveConfig,
  validateConfig,
  isPublicBaseUrl
};
