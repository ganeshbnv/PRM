import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { Errors } from '../utils/errors';

export function validate(req: Request, _res: Response, next: NextFunction): void {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    next(Errors.validation(result.array()));
    return;
  }
  next();
}
