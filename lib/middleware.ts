import type { Operation } from "effection";
import type { LSPXMiddleware } from "./types.ts";

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

export function createLSPXMiddleware(options: {
  client2server?: {
    request?: LSPXMiddleware["client2Server"]["request"];
    notify?: LSPXMiddleware["client2Server"]["notify"];
  };
  server2client?: {
    request?: LSPXMiddleware["server2Client"]["request"];
    notify?: LSPXMiddleware["server2Client"]["notify"];
  };
}): LSPXMiddleware {
  return {
    client2Server: options.client2server
      ? ({
        request: options.client2server?.request ??
          ((input, next) => next(input)),
        notify: options.client2server?.notify ?? ((input, next) => next(input)),
      })
      : ({
        request: (input, next) => next(input),
        notify: (input, next) => next(input),
      }),
    server2Client: options.server2client
      ? ({
        request: options.server2client.request ??
          ((input, next) => next(input)),
        notify: options.server2client.notify ?? ((input, next) => next(input)),
      })
      : ({
        request: (input, next) => next(input),
        notify: (input, next) => next(input),
      }),
  };
}

export function combineLSPXMiddlewares(
  middlewares: LSPXMiddleware[],
): LSPXMiddleware {
  return {
    client2Server: {
      request: concat(
        ...middlewares.map(({ client2Server }) => client2Server.request),
      ),
      notify: concat(
        ...middlewares.map(({ client2Server }) => client2Server.notify),
      ),
    },
    server2Client: {
      request: concat(
        ...middlewares.map(({ server2Client }) => server2Client.request),
      ),
      notify: concat(
        ...middlewares.map(({ server2Client }) => server2Client.notify),
      ),
    },
  };
}
