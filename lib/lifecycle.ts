import type { Operation, Stream } from "effection";
import { all, call, createChannel } from "effection";
import type { LSPAgent, RPCEndpoint } from "./types.ts";
import { ErrorCodes } from "vscode-jsonrpc";
import type { InitializeResult } from "vscode-languageserver-protocol";
import { responseError } from "./json-rpc-connection.ts";
import * as merge from "./merge.ts";
import * as dispatch from "./dispatch.ts";

export interface State {
  notify: RPCEndpoint["notify"];
  request: RPCEndpoint["request"];
}

export function lifecycle(
  servers: RPCEndpoint[],
): [State, Stream<State, void>] {
  let states = createChannel<State, void>();
  return [uninitializedState(servers, states.send), states];
}

function uninitializedState(
  servers: RPCEndpoint[],
  transition: (state: State) => Operation<void>,
): State {
  return {
    *notify() {},
    *request(params) {
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

      yield* transition(initializedState(agents, transition));

      return cast(merge.capabilities(agents));
    },
  };
}

function initializedState(
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
      let [method] = params;
      if (method === "initialize") {
        yield* responseError(
          ErrorCodes.InvalidRequest,
          `initialize invoked twice`,
        );
      } else if (method === "shutdown") {
        yield* transition(shutdownState);
        for (let agent of agents) {
          yield* agent.request(params);
        }
        return cast(null);
      }

      return cast(yield* dispatch.request({agents, params}));
    },
  };
}

const shutdownState: State = {
  *notify() {},
  *request() {
    return yield* responseError(
      ErrorCodes.InvalidRequest,
      `server is shut down`,
    );
  },
};

const cast = <T>(value: unknown) => value as T;
