import {
  call,
  createSignal,
  type Operation,
  resource,
  useScope,
} from "effection";
import type {
  Disposable,
  LSPXServer,
  Notification,
  RequestParams,
} from "./types.ts";

import { useCommand, useDaemon } from "./use-command.ts";
import { useConnection } from "./json-rpc-connection.ts";
import {
  ErrorCodes,
  type MessageConnection,
  ResponseError,
  type StarRequestHandler,
} from "vscode-jsonrpc";

export interface LSPXOptions {
  interactive?: boolean;
  input?: ReadableStream<Uint8Array>;
  output?: WritableStream<Uint8Array>;
  commands: string[];
}

export function start(opts: LSPXOptions): Operation<LSPXServer> {
  return resource(function* (provide) {
    let notifications = createSignal<Notification, never>();
    let connections: MessageConnection[] = [];
    let disposables: Disposable[] = [];

    try {
      for (let command of opts.commands) {
        let [exe, ...args] = command.split(/\s/g);
        let process = yield* useDaemon(exe, {
          args,
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        let connection = yield* useConnection({
          read: process.stdout,
          write: process.stdin,
        });
        connections.push(connection);
        disposables.push(connection);
        disposables.push(
          connection.onNotification((method, params) =>
            notifications.send({ method, params })
          ),
        );
      }

      let client = yield* useConnection({
        read: opts.input ?? ReadableStream.from([]),
        write: opts.output ?? new WritableStream(),
      });

      let scope = yield* useScope();
      let dispatch = createDispatch(connections);

      let handler: StarRequestHandler = (...params) =>
        scope.run(() => dispatch(...params));

      disposables.push(client.onRequest(handler));

      yield* provide({
        notifications,
        *request<T>(...params: RequestParams): Operation<T> {
          const result = yield* dispatch<T, unknown>(...params);
          if (result instanceof ResponseError) {
            throw result;
          }
          return result;
        },
      });
    } finally {
      for (let disposable of disposables) {
        disposable.dispose();
      }
    }
  });
}

function createDispatch(
  connections: MessageConnection[],
): <T, E>(...params: RequestParams) => Operation<T | ResponseError<E>> {
  return function* dispatch(...params) {
    for (let connection of connections) {
      return (yield* call(() => connection.sendRequest(...params)));
    }
    return new ResponseError(
      ErrorCodes.ServerNotInitialized,
      `no active server connections`,
    );
  };
}
