export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AuthError extends ApiError {
  constructor(message: string, status = 401, responseBody = '') {
    super(message, status, responseBody);
    this.name = 'AuthError';
  }
}

export class SpreadsheetMissing extends ApiError {
  constructor(message = 'The spreadsheet no longer exists.', status = 404, responseBody = '') {
    super(message, status, responseBody);
    this.name = 'SpreadsheetMissing';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
