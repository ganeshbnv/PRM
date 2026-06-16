import { Request, Response, NextFunction } from 'express';
import { AxiosError } from 'axios';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 502;
    res.status(status).json({
      error: 'ADO API error',
      message: err.message,
      adoStatus: err.response?.status,
      adoMessage: err.response?.data?.message,
    });
    return;
  }
  if (err instanceof Error) {
    res.status(500).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Unknown server error' });
}
