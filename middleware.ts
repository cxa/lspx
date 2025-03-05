import type { Operation } from "effection";

export interface Middleware<In, Out> {
  (request: In, next: (input: In) => Operation<Out>): Operation<Out>;
}

export function concat<A, B>(
  ...middlewares: Middleware<A, B>[]
): Middleware<A, B> {
  if (middlewares.length === 0) {
    return (request, next) => next(request);
  } else {
    return middlewares.reduceRight((rest, middleware) => {
      return (request, next) => middleware(request, (req) => rest(req, next));
    });
  }
}
