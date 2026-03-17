function createElevenLabsService(options = {}) {
  const kieService = options.kieService;

  if (!kieService) {
    throw new Error("createElevenLabsService requires a kieService instance.");
  }

  return {
    async generateVoiceover({ text, voiceId, kieApiKey }) {
      return kieService.generateSpeech({
        text,
        voiceId,
        kieApiKey
      });
    },

    async pollVoiceover(taskId, options = {}) {
      return kieService.pollSpeechStatus(taskId, options);
    }
  };
}

module.exports = {
  createElevenLabsService
};
