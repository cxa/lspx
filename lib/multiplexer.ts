import type { Operation } from "effection";
import { createChannel, each, resource, spawn } from "effection";
import type {
  LSPServerRequest,
  NotificationParams,
  RPCEndpoint,
} from "./types.ts";
import { lifecycle } from "./lifecycle.ts";

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
    let [state, states] = lifecycle(servers);

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
