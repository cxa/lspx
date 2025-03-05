import {
  call,
  createContext,
  createSignal,
  ensure,
  type Operation,
  race,
  resource,
  suspend,
  useScope,
  withResolvers,
} from "effection";
import type {
  Disposable,
  LSPXServer,
  Notification,
  RequestParams,
} from "./types.ts";

import { useDaemon } from "./use-command.ts";
import { useConnection } from "./json-rpc-connection.ts";
import {
  ErrorCodes,
  type MessageConnection,
  ResponseError,
  type StarRequestHandler,
} from "vscode-jsonrpc";
import { concat, type Middleware } from "./middleware.ts";

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

    yield* ensure(() => {
      for (let disposable of disposables) {
        disposable.dispose();
      }
    });

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
  });
}

const ResponseErrorContext = createContext<
  <T>(error: ResponseError<T>) => void
>("lspx.responseError");

function createDispatch(
  connections: MessageConnection[],
): <T, E>(...params: RequestParams) => Operation<T | ResponseError<E>> {
  let middleware: Middleware<RequestParams, unknown> = concat(
    ensureInitialized(),
    multiplex(connections),
  );

  return function* dispatch<T, E>(
    ...params: RequestParams
  ): Operation<T | ResponseError<E>> {
    let { operation: errored, resolve: raise } = withResolvers<
      ResponseError<unknown>
    >();
    yield* ResponseErrorContext.set(raise);

    return yield* race([
      errored as Operation<ResponseError<E>>,
      middleware(
        params,
        () => responseError(ErrorCodes.InternalError, "unhandled request"),
      ) as Operation<T>,
    ]);
  };
}

function* responseError<T = void>(
  ...args: ConstructorParameters<typeof ResponseError<T>>
  // deno-lint-ignore no-explicit-any
): Operation<any> {
  let raise = yield* ResponseErrorContext.expect();

  raise<T>(new ResponseError(...args));

  yield* suspend();
}

function ensureInitialized(): Middleware<RequestParams, unknown> {
  let initialized = false;
  return function* (request, next) {
    let [method] = request;
    if (initialized && method === "initialize") {
      return yield* responseError(
        ErrorCodes.InvalidRequest,
        "initialize invoked twice",
      );
    } else if (!initialized && method !== "initialize") {
      return yield* responseError(
        ErrorCodes.ServerNotInitialized,
        "server not initialized",
      );
    } else {
      initialized = true;
      return yield* next(request);
    }
  };
}

function multiplex(
  connections: MessageConnection[],
): Middleware<RequestParams, unknown> {
  let [connection] = connections;

  return function* (params) {
    if (!connection) {
      return yield* responseError(
        ErrorCodes.InternalError,
        "lspx is not connected to any language servers",
      );
    } else {
      return yield* call(() => connection.sendRequest(...params));
    }
  };
}
