require("dotenv").config();

const { createRuntime } = require("./src/runtime");

const runtime = createRuntime();

const server = runtime.app.listen(runtime.config.port, () => {
  runtime.logger.info("server_started", {
    port: runtime.config.port,
    baseUrl: runtime.config.baseUrl,
    databasePath: runtime.config.databasePath,
    warnings: runtime.validation.warnings
  });
});

function shutdown(signal) {
  runtime.logger.info("server_shutdown_requested", { signal });
  server.close(() => {
    runtime.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
