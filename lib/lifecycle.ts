import { all, call } from "effection";
import type { LSPAgent, LSPXMiddleware } from "./types.ts";
import { ErrorCodes } from "vscode-jsonrpc";
import type { InitializeResult } from "vscode-languageserver-protocol";
import { responseError } from "./json-rpc-connection.ts";
import * as merge from "./merge.ts";
import { createLSPXMiddleware } from "./middleware.ts";

export function lifecycle(): LSPXMiddleware {
  let transition = (state: State) => {
    currentState = state;
  };
  let currentState = uninitialized(transition);

  return createLSPXMiddleware({
    client2server: {
      *request(params, next) {
        let { middleware: { client2Server } } = currentState;
        return yield* client2Server.request(params, next);
      },
      *notify(params, next) {
        let { middleware: { client2Server } } = currentState;
        return yield* client2Server.notify(params, next);
      },
    },
    server2client: {
      *request(params, next) {
        let { middleware: { server2Client } } = currentState;
        return yield* server2Client.request(params, next);
      },
      *notify(params, next) {
				const [method, ...reqParams] = params.params;
				reqParams.forEach((p) => {
					if (typeof p === 'object'
							&& p !== null
							&& method === 'textDocument/publishDiagnostics') {
						(p as Record<string, unknown>)._lspx_agent = params.agent.name;
					}
				});
        let { middleware: { server2Client } } = currentState;
        return yield* server2Client.notify(params, next);
      },
    },
  });
}

function uninitialized(transition: (state: State) => void): State {
  let middleware = createLSPXMiddleware({
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

        transition(initialized(agents, transition));

        return cast(merge.capabilities(agents));
      },
    },
  });
  return { name: "UNINITIALIZED", middleware };
}

function initialized(agents: LSPAgent[], transition: SetState): State {
  let middleware = createLSPXMiddleware({
    client2server: {
      notify: (options, next) => next({ ...options, agents }),
      *request(options, next) {
        let [method] = options.params;
        if (method === "initialize") {
          yield* responseError(
            ErrorCodes.InvalidRequest,
            `initialize invoked twice`,
          );
        } else if (method === "shutdown") {
          transition(shutdown());
          yield* all(agents.map((agent) => agent.request(options.params)));
          return null;
        } else {
          return yield* next({ ...options, agents });
        }
      },
    },
  });

  return { name: "INITIALIZED", middleware };
}

function shutdown(): State {
  let middleware = createLSPXMiddleware({
    client2server: {
      *request() {
        return yield* responseError(
          ErrorCodes.InvalidRequest,
          `server is shut down`,
        );
      },
    },
  });
  return { name: "SHUTDOWN", middleware };
}

const cast = <T>(value: unknown) => value as T;

interface State {
  name: string;
  middleware: LSPXMiddleware;
}

interface SetState {
  (state: State): void;
}
