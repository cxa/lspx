import { all, call, createContext } from "effection";
import type { LSPAgent, LSPXMiddleware } from "./types.ts";
import { ErrorCodes } from "vscode-jsonrpc";
import type { InitializeResult } from "vscode-languageserver-protocol";
import { responseError } from "./json-rpc-connection.ts";
import * as merge from "./merge.ts";
import { createLSPXMiddleware } from "./middleware.ts";

const State = createContext<LSPXMiddleware>("lspx.state", uninitialized());

export function lifecycle(): LSPXMiddleware {
  return createLSPXMiddleware({
    client2server: {
      *request(params, next) {
        let state = yield* State.expect();
        return yield* state.client2Server.request(params, next);
      },
      *notify(params, next) {
        let state = yield* State.expect();
        return yield* state.client2Server.notify(params, next);
      },
    },
    server2client: {
      *request(params, next) {
        let state = yield* State.expect();
        return yield* state.server2Client.request(params, next);
      },
      *notify(params, next) {
        let state = yield* State.expect();
        return yield* state.server2Client.notify(params, next);
      },
    },
  });
}

function uninitialized(): LSPXMiddleware {
  return createLSPXMiddleware({
    client2server: {
      *request(options) {
        let [method] = options.params;
        if (method !== "initialize") {
          yield* responseError(
            ErrorCodes.ServerNotInitialized,
            `server not initialized`,
          );
        }
        let agents = yield* all(
          options.agents.map((agent) =>
            call(function* () {
              let initialization = yield* agent.request<InitializeResult>(
                options.params,
              );
              let { capabilities } = initialization;
              return {
                ...agent,
                initialization,
                capabilities,
              } as LSPAgent;
            })
          ),
        );

        yield* State.set(initialized(agents));

        return cast(merge.capabilities(agents));
      },
    },
  });
}

function initialized(agents: LSPAgent[]): LSPXMiddleware {
  return createLSPXMiddleware({
    client2server: {
      notify(options, next) {
        return next({ ...options, agents });
      },
      *request(options, next) {
        let [method] = options.params;
        if (method === "initialize") {
          yield* responseError(
            ErrorCodes.InvalidRequest,
            `initialize invoked twice`,
          );
        } else if (method === "shutdown") {
          yield* State.set(shutdown());
          yield* all(agents.map((agent) => agent.request(options.params)));
          return null;
        } else {
          return yield* next({ ...options, agents });
        }
      },
    },
  });
}

function shutdown(): LSPXMiddleware {
  return createLSPXMiddleware({
    client2server: {
      *request() {
        return yield* responseError(
          ErrorCodes.InvalidRequest,
          `server is shut down`,
        );
      },
    },
  });
}

const cast = <T>(value: unknown) => value as T;
