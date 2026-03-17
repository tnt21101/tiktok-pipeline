const test = require("node:test");
const assert = require("node:assert/strict");
const { requestJson } = require("../../src/utils/http");

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test("requestJson retries retryable upstream errors before succeeding", async () => {
  let calls = 0;
  const payload = await requestJson("https://example.com/provider", {
    retries: 2,
    retryDelayMs: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) {
        return jsonResponse(500, { error: "temporary" });
      }

      return jsonResponse(200, { ok: true });
    }
  });

  assert.equal(calls, 3);
  assert.deepEqual(payload, { ok: true });
});

test("requestJson does not retry non-retryable upstream errors", async () => {
  let calls = 0;

  await assert.rejects(() => requestJson("https://example.com/provider", {
    retries: 2,
    retryDelayMs: 1,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(400, { error: "bad request" });
    }
  }), /status 400/);

  assert.equal(calls, 1);
});
