function write(level, event, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function createLogger(context = {}) {
  function withBaseMeta(meta = {}) {
    return {
      ...context,
      ...meta
    };
  }

  return {
    info(event, meta) {
      write("info", event, withBaseMeta(meta));
    },
    warn(event, meta) {
      write("warn", event, withBaseMeta(meta));
    },
    error(event, meta) {
      write("error", event, withBaseMeta(meta));
    }
  };
}

module.exports = {
  createLogger
};
