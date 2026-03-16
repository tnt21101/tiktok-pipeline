class AppError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code || "app_error";
    this.details = options.details;
  }
}

function asyncRoute(handler) {
  return function routeHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function serializeError(error) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  return {
    statusCode: 500,
    code: "internal_error",
    message: error && error.message ? error.message : "Unexpected server error."
  };
}

module.exports = {
  AppError,
  asyncRoute,
  serializeError
};
