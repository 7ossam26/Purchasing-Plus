import type { ErrorRequestHandler } from 'express';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    messageAr: string,
    public readonly fixAr?: string,
  ) {
    super(messageAr);
    this.name = 'AppError';
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  void _next;
  if (error instanceof AppError) {
    response.status(error.status).json({ error: error.code, message: error.message, fix: error.fixAr });
    return;
  }
  response.status(500).json({ error: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقع' });
};
