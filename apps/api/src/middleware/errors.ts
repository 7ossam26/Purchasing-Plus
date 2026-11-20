import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

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

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (response.headersSent) {
    _next(error);
    return;
  }
  if (error instanceof ZodError)
    error = new AppError(
      422,
      'VALIDATION',
      'بيانات غير صالحة: ' +
        error.issues.map((i) => i.path.join('.')).join('، '),
    );
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002')
      error = new AppError(409, 'DUPLICATE', 'الاسم مستخدم بالفعل');
    else if (error.code === 'P2025')
      error = new AppError(404, 'NOT_FOUND', 'السجل غير موجود');
  }
  if (error instanceof AppError) {
    response
      .status(error.status)
      .json({ error: error.code, message: error.message, fix: error.fixAr });
    return;
  }
  response
    .status(500)
    .json({ error: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقع' });
};
