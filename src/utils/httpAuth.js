const { timingSafeEqual } = require("node:crypto");

function parseBasicAuthHeader(header = "") {
  const raw = String(header || "");
  if (!raw.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(raw.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidBasicAuth(credentials, username, password) {
  if (!credentials) {
    return false;
  }

  return safeEqual(credentials.username, username)
    && safeEqual(credentials.password, password);
}

module.exports = {
  parseBasicAuthHeader,
  isValidBasicAuth
};
