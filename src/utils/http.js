const { AppError } = require("./errors");

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const statusCode = response.status === 429 ? 429 : 502;
      const message = response.status === 429
        ? "Upstream provider rate-limited the request."
        : `Upstream provider request failed with status ${response.status}.`;

      throw new AppError(statusCode, message, {
        code: response.status === 429 ? "upstream_rate_limited" : "upstream_request_failed",
        details: {
          url,
          upstreamStatus: response.status,
          payload
        }
      });
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError(504, "Upstream provider request timed out.", {
        code: "upstream_timeout",
        details: { url, timeoutMs }
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  requestJson
};
