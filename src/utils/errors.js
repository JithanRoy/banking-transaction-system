export class ApiError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const toHttpError = (error) => {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message, code: error.code },
    };
  }

  return {
    statusCode: 500,
    body: { error: "Internal server error", code: "INTERNAL_ERROR" },
  };
};
