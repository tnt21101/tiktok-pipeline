const { createRemotionService } = require("./remotion");

function createNarratedComposeService(options = {}) {
  const remotionService = createRemotionService(options);

  return {
    isAvailable: remotionService.isAvailable,
    async compose(job, segments = [], brand = null) {
      return remotionService.renderNarratedVideo({
        job,
        brand,
        segments
      });
    }
  };
}

module.exports = {
  createNarratedComposeService
};
