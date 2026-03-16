const { createHash } = require("node:crypto");
const { normalizePlatformConfigs } = require("../channels/ayrshare");
const { stableStringify } = require("../utils/json");

function hashDistributionRequest(videoUrl, platformConfigs) {
  return createHash("sha256")
    .update(stableStringify({
      videoUrl,
      platformConfigs: normalizePlatformConfigs(platformConfigs)
    }))
    .digest("hex");
}

function createDistributionService(options = {}) {
  const channel = options.channel;

  return {
    getRequestHash(videoUrl, platformConfigs) {
      return hashDistributionRequest(videoUrl, platformConfigs);
    },

    async distributeVideo(videoUrl, platformConfigs, options = {}) {
      const normalizedConfigs = normalizePlatformConfigs(platformConfigs);
      const results = await channel.publish(videoUrl, normalizedConfigs, options);
      return {
        requestHash: hashDistributionRequest(videoUrl, platformConfigs),
        results
      };
    }
  };
}

module.exports = {
  createDistributionService,
  hashDistributionRequest
};
