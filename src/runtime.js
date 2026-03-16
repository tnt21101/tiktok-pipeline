const { resolveConfig, validateConfig } = require("./config");
const { createLogger } = require("./logger");
const { createDatabase } = require("./db/database");
const { createBrandRepository } = require("./repositories/brandRepository");
const { createSettingsRepository } = require("./repositories/settingsRepository");
const { createJobRepository } = require("./repositories/jobRepository");
const { createAnthropicService } = require("./services/anthropic");
const { createKieService } = require("./services/kieai");
const { createFalService } = require("./services/fal");
const { createAyrshareChannel } = require("./channels/ayrshare");
const { createDistributionService } = require("./services/distribute");
const { createJobManager } = require("./jobs/jobManager");
const { createApp } = require("./app");

function createRuntime(options = {}) {
  const config = options.config || resolveConfig(process.env);
  const validation = validateConfig(config);
  const logger = options.logger || createLogger({ app: "tiktok-pipeline" });

  if (validation.errors.length > 0) {
    throw new Error(`Configuration errors: ${validation.errors.join(" ")}`);
  }

  const db = options.db || createDatabase(config, logger);
  const brandRepository = options.brandRepository || createBrandRepository(db);
  const settingsRepository = options.settingsRepository || createSettingsRepository(db);
  const jobRepository = options.jobRepository || createJobRepository(db);

  const anthropicService = options.anthropicService || createAnthropicService({
    apiKey: config.anthropicApiKey,
    logger
  });

  const kieService = options.kieService || createKieService({
    apiKey: config.kieApiKey,
    baseCallbackUrl: config.baseUrl,
    logger
  });

  const falService = options.falService || createFalService({
    apiKey: config.falApiKey,
    logger
  });

  const ayrshareChannel = options.ayrshareChannel || createAyrshareChannel({
    apiKey: config.ayrshareApiKey,
    logger
  });

  const distributionService = options.distributionService || createDistributionService({
    channel: ayrshareChannel,
    logger
  });

  const jobManager = options.jobManager || createJobManager({
    jobRepository,
    brandRepository,
    anthropicService,
    kieService,
    falService,
    distributionService,
    logger,
    pollIntervalMs: config.jobPollIntervalMs
  });

  jobManager.bootstrap();

  const { app } = createApp({
    config,
    validation,
    logger,
    brandRepository,
    settingsRepository,
    jobManager,
    anthropicService,
    kieService,
    falService,
    distributionService
  });

  return {
    app,
    config,
    validation,
    logger,
    close() {
      jobManager.shutdown();
      if (!options.db && db && typeof db.close === "function") {
        db.close();
      }
    }
  };
}

module.exports = {
  createRuntime
};
