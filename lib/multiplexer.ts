import type { Operation } from "effection";
import { createChannel, each, resource, spawn } from "effection";
import type {
  LSPAgent,
  LSPServerNotification,
  LSPServerRequest,
  LSPXMiddleware,
  RequestParams,
  RPCEndpoint,
} from "./types.ts";
import { lifecycle } from "./lifecycle.ts";
import { combineLSPXMiddlewares } from "./middleware.ts";
import { defaultHandler } from "./dispatch.ts";
import { responseError } from "./json-rpc-connection.ts";
import { ErrorCodes } from "vscode-languageserver-protocol";

export interface MultiplexerOptions {
  agents: LSPAgent[];
  middlewares: LSPXMiddleware[];
}

export function useMultiplexer(
  options: MultiplexerOptions,
): Operation<RPCEndpoint> {
  return resource(function* (provide) {
    let { client2Server, server2Client } = combineLSPXMiddlewares([
      lifecycle(),
      ...options.middlewares,
      defaultHandler(),
    ]);

    let { agents } = options;

    let notifications = createChannel<LSPServerNotification>();
    let requests = createChannel<LSPServerRequest>();

    // forward all notifications and requests from server -> client
    for (let agent of agents) {
      yield* spawn(function* () {
        for (let notification of yield* each(agent.notifications)) {
          let middleware = server2Client.notify;
          yield* notifications.send((execute) =>
            notification((params) =>
              middleware({ agent, params }, ({ params }) => execute(params))
            )
          );
          yield* each.next();
        }
      });

      yield* spawn(function* () {
        for (let request of yield* each(agent.requests)) {
          let middleware = server2Client.request;
          yield* requests.send((execute) =>
            request((params) =>
              middleware({ agent, params }, ({ params }) => execute(params))
            )
          );
          yield* each.next();
        }
      });
    }

    let multiplexer: RPCEndpoint = {
      notifications,
      requests,
      notify: (params) =>
        client2Server.notify({ agents, params }, function* ({ params }) {
          let [method, ...rest] = params;
          console.error(`no handler found for notification '${method}'`, rest);
        }),
      request: <T>(params: RequestParams) =>
        client2Server.request({ agents, params }, function* ({ params }) {
          let [method] = params;
          return yield* responseError(
            ErrorCodes.MethodNotFound,
            `no handler found for '${method}'`,
          );
        }) as Operation<
          T
        >,
    };

    yield* provide(multiplexer);
  });
}
