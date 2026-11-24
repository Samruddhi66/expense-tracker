export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Invalid request', details?: unknown) {
    return new ApiError(400, message, 'bad_request', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, 'unauthorized');
  }
  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, message, 'forbidden');
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message, 'not_found');
  }
  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message, 'conflict');
  }
  static tooMany(message = 'Too many requests, please try again later') {
    return new ApiError(429, message, 'rate_limited');
  }
}
