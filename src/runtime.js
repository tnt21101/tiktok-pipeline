const { resolveConfig, validateConfig } = require("./config");
const { createLogger } = require("./logger");
const { createDatabase } = require("./db/database");
const { createBrandRepository } = require("./repositories/brandRepository");
const { createProductRepository } = require("./repositories/productRepository");
const { createSettingsRepository } = require("./repositories/settingsRepository");
const { createApiKeyStore } = require("./settings/apiKeys");
const { createJobRepository } = require("./repositories/jobRepository");
const { createJobSegmentRepository } = require("./repositories/jobSegmentRepository");
const { createJobSlideRepository } = require("./repositories/jobSlideRepository");
const { createAnthropicService } = require("./services/anthropic");
const { createAmazonCatalogService } = require("./services/amazonCatalog");
const { createKieService } = require("./services/kieai");
const { createElevenLabsService } = require("./services/elevenlabs");
const { createFalService } = require("./services/fal");
const { createNarratedComposeService } = require("./services/narratedCompose");
const { createSlidesComposeService } = require("./services/slidesCompose");
const { createNarratedWorkflowService } = require("./services/narratedWorkflow");
const { createSlideWorkflowService } = require("./services/slideWorkflow");
const { createTopicStrategyService } = require("./services/topicStrategy");
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
  const productRepository = options.productRepository || createProductRepository(db);
  const settingsRepository = options.settingsRepository || createSettingsRepository(db);
  const apiKeyStore = options.apiKeyStore || createApiKeyStore({
    config,
    settingsRepository
  });
  const jobRepository = options.jobRepository || createJobRepository(db);
  const jobSegmentRepository = options.jobSegmentRepository || createJobSegmentRepository(db);
  const jobSlideRepository = options.jobSlideRepository || createJobSlideRepository(db);

  const anthropicService = options.anthropicService || createAnthropicService({
    apiKey: () => apiKeyStore.getEffectiveValue("anthropic"),
    logger
  });

  const kieService = options.kieService || createKieService({
    apiKey: () => apiKeyStore.getEffectiveValue("kie"),
    baseCallbackUrl: config.baseUrl,
    logger
  });

  const amazonCatalogService = options.amazonCatalogService || createAmazonCatalogService({
    logger
  });

  const falService = options.falService || createFalService({
    apiKey: () => apiKeyStore.getEffectiveValue("fal"),
    logger
  });

  const elevenLabsService = options.elevenLabsService || createElevenLabsService({
    apiKey: () => apiKeyStore.getEffectiveValue("elevenlabs"),
    outputDir: config.outputDir,
    baseUrl: () => config.baseUrl,
    logger
  });

  const narratedComposeService = options.narratedComposeService || createNarratedComposeService({
    outputDir: config.outputDir,
    baseUrl: config.baseUrl
  });
  const slideComposeService = options.slideComposeService || createSlidesComposeService({
    outputDir: config.outputDir,
    baseUrl: config.baseUrl
  });

  const ayrshareChannel = options.ayrshareChannel || createAyrshareChannel({
    apiKey: () => apiKeyStore.getEffectiveValue("ayrshare"),
    logger
  });

  const distributionService = options.distributionService || createDistributionService({
    channel: ayrshareChannel,
    logger
  });

  const jobManager = options.jobManager || createJobManager({
    jobRepository,
    jobSegmentRepository,
    jobSlideRepository,
    brandRepository,
    productRepository,
    anthropicService,
    kieService,
    falService,
    distributionService,
    logger,
    baseUrl: () => config.baseUrl,
    uploadsDir: config.uploadsDir,
    outputDir: config.outputDir,
    pollIntervalMs: config.jobPollIntervalMs,
    generationTimeoutMs: config.generationTimeoutMs
  });

  const narratedWorkflowService = options.narratedWorkflowService || createNarratedWorkflowService({
    brandRepository,
    jobRepository,
    jobSegmentRepository,
    anthropicService,
    kieService,
    elevenLabsService,
    narratedComposeService,
    jobManager,
    pollIntervalMs: config.jobPollIntervalMs
  });
  const slideWorkflowService = options.slideWorkflowService || createSlideWorkflowService({
    brandRepository,
    jobRepository,
    jobSlideRepository,
    anthropicService,
    slideComposeService
  });
  const topicStrategyService = options.topicStrategyService || createTopicStrategyService({
    amazonCatalogService,
    anthropicService,
    logger
  });

  jobManager.bootstrap();
  if (typeof narratedWorkflowService.bootstrap === "function") {
    narratedWorkflowService.bootstrap();
  }

  const { app } = createApp({
    config,
    validation,
    logger,
    brandRepository,
    productRepository,
    settingsRepository,
    apiKeyStore,
    jobManager,
    narratedWorkflowService,
    slideWorkflowService,
    anthropicService,
    amazonCatalogService,
    topicStrategyService,
    kieService,
    elevenLabsService,
    narratedComposeService,
    slideComposeService,
    falService,
    distributionService
  });

  return {
    app,
    config,
    validation,
    logger,
    close() {
      if (typeof narratedWorkflowService.shutdown === "function") {
        narratedWorkflowService.shutdown();
      }
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
