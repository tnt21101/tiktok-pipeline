const { AppError } = require("./errors");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function requestJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const retries = Number.isFinite(options.retries) ? options.retries : 2;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 350;
  const fetchImpl = options.fetchImpl || fetch;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
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
        const retryable = isRetryableStatus(response.status);
        if (retryable && attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        const statusCode = response.status === 429 ? 429 : 502;
        const message = response.status === 429
          ? "Upstream provider rate-limited the request."
          : `Upstream provider request failed with status ${response.status}.`;

        throw new AppError(statusCode, message, {
          code: response.status === 429 ? "upstream_rate_limited" : "upstream_request_failed",
          details: {
            url,
            upstreamStatus: response.status,
            retryable,
            attempts: attempt + 1,
            payload
          }
        });
      }

      return payload;
    } catch (error) {
      if (error.name === "AbortError") {
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        throw new AppError(504, "Upstream provider request timed out.", {
          code: "upstream_timeout",
          details: {
            url,
            timeoutMs,
            attempts: attempt + 1
          }
        });
      }

      if (error instanceof AppError) {
        throw error;
      }

      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = {
  requestJson
};
