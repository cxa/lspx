import type { Operation } from "effection";
import { all, call, createChannel, each, resource, spawn } from "effection";

import type {
  LSPAgent,
  LSPServerRequest,
  NotificationParams,
  RequestParams,
  RPCEndpoint,
} from "./types.ts";
import { ErrorCodes } from "vscode-jsonrpc";
import type { InitializeResult } from "vscode-languageserver-protocol";
import { responseError } from "./json-rpc-connection.ts";
import * as merge from "./merge.ts";

export interface MultiplexerOptions {
  servers: RPCEndpoint[];
}

export function useMultiplexer(
  options: MultiplexerOptions,
): Operation<RPCEndpoint> {
  return resource(function* (provide) {
    let { servers } = options;

    let notifications = createChannel<NotificationParams>();
    let requests = createChannel<LSPServerRequest>();

    // forward all notifications and requests from server -> client
    for (let server of servers) {
      yield* spawn(function* () {
        for (let notification of yield* each(server.notifications)) {
          yield* notifications.send(notification);
          yield* each.next();
        }
      });

      yield* spawn(function* () {
        for (let request of yield* each(server.requests)) {
          yield* requests.send(request);
          yield* each.next();
        }
      });
    }

    // delegate notifications and requests from client -> server to current state
    let states = createChannel<State, never>();
    let state = uninitialized(servers, states.send);

    yield* spawn(function* () {
      for (state of yield* each(states)) {
        yield* each.next();
      }
    });

    let multiplexer: RPCEndpoint = {
      notifications,
      requests,
      notify: (params) => state.notify(params),
      request: (params) => state.request(params),
    };

    yield* provide(multiplexer);
  });
}

export interface State {
  notify: RPCEndpoint["notify"];
  request: RPCEndpoint["request"];
}

function uninitialized(
  servers: RPCEndpoint[],
  transition: (state: State) => Operation<void>,
): State {
  return {
    *notify() {},
    *request<T>(params: RequestParams): Operation<T> {
      let [method] = params;
      if (method !== "initialize") {
        yield* responseError(
          ErrorCodes.ServerNotInitialized,
          `server not initialized`,
        );
      }
      let agents = yield* all(servers.map((server) =>
        call(function* () {
          let initialization = yield* server.request<InitializeResult>(
            params,
          );
          let { capabilities } = initialization;
          return {
            ...server,
            initialization,
            capabilities,
          } as LSPAgent;
        })
      ));

      yield* transition(initialized(agents, transition));

      return merge.capabilities(agents) as T;
    },
  };
}

function initialized(
  agents: LSPAgent[],
  transition: (state: State) => Operation<void>,
): State {
  return {
    *notify(params) {
      // TODO: only forward notifications to interested agents
      for (let agent of agents) {
        yield* agent.notify(params);
      }
    },
    *request(params) {
      let [first] = agents;
      let [method] = params;
      if (method === "initialize") {
        yield* responseError(
          ErrorCodes.InvalidRequest,
          `initialize invoked twice`,
        );
      } else if (method === "shutdown") {
        yield* transition(shutdown);
        for (let agent of agents) {
          yield* agent.request(params);
        }
        return cast(null);
      } else if (!first) {
        throw yield* responseError(
          ErrorCodes.InternalError,
          `no lsps to make requests`,
        );
      }

      return yield* first.request(params);
    },
  };
}

const shutdown: State = {
  *notify() {},
  *request() {
    return yield* responseError(
      ErrorCodes.InvalidRequest,
      `server is shut down`,
    );
  },
};

const cast = <T>(value: unknown) => value as T;
