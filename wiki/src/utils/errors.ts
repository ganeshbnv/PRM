export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function createError(
  code: string,
  message: string,
  statusCode: number,
  details?: unknown
): AppError {
  return new AppError(code, message, statusCode, details);
}

export const Errors = {
  unauthorized: (msg = 'Unauthorized') => createError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'Forbidden') => createError('FORBIDDEN', msg, 403),
  notFound: (resource = 'Resource') => createError('NOT_FOUND', `${resource} not found`, 404),
  conflict: (msg: string) => createError('CONFLICT', msg, 409),
  validation: (details?: unknown) =>
    createError('VALIDATION_ERROR', 'Validation failed', 422, details),
  internal: (msg = 'Internal server error') => createError('INTERNAL_ERROR', msg, 500),
};
