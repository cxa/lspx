import type { LSPXMiddleware } from "./types.ts";
import { createLSPXMiddleware } from "./middleware.ts";

/**
 * This debug middleware prints handy diagnostics to stderr with
 * every request/notification in both directions
 */
export function debug(): LSPXMiddleware {
  return createLSPXMiddleware({
    client2server: {
      *request(req, next) {
        let [method, ...params] = req.params;
        console.error(
          `--> [client2server.request]`,
          req.agents.map((a) => a.name),
          method,
          params,
        );
        let result = yield* next(req);
        console.error(
          `<-- [client2server.request]`,
          req.agents.map((a) => a.name),
          method,
          result,
        );
        return result;
      },
      *notify(req, next) {
        let [method, ...params] = req.params;
        console.error(
          `--> [client2server.notify]`,
          req.agents.map((a) => a.name),
          method,
          params,
        );
        let result = yield* next(req);
        return result;
      },
    },
    server2client: {
      *request(req, next) {
        let [method, ...params] = req.params;
        console.error(
          `--> [server2client.request]`,
          req.agent.name,
          method,
          params,
        );
        let result = yield* next(req);
        console.error(
          `<-- [server2client.request]`,
          req.agent.name,
          method,
          result,
        );
        return result;
      },

      *notify(req, next) {
        let [method, ...params] = req.params;
        console.error(
          `--> [server2client.notify]`,
          req.agent.name,
          method,
          params,
        );
        let result = yield* next(req);
        return result;
      },
    },
  });
}
