import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

type Targets = { body?: ZodSchema; query?: ZodSchema; params?: ZodSchema };

export function validate(schemas: Targets) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}
