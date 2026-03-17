const { createRemotionService } = require("./remotion");

function createSlidesComposeService(options = {}) {
  const remotionService = createRemotionService(options);

  return {
    isAvailable: remotionService.isAvailable,
    async compose(job, slides = [], brand = null) {
      return remotionService.renderSlidesVideo({
        job,
        brand,
        slides
      });
    }
  };
}

module.exports = {
  createSlidesComposeService
};
