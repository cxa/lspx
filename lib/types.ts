// deno-lint-ignore-file no-explicit-any
import type { Operation, Stream } from "effection";
import type {
  StarNotificationHandler,
  StarRequestHandler,
} from "vscode-jsonrpc";
import type {
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver-protocol";

export interface LSPXServer {
  notifications: Stream<Notification, never>;
  request<T>(...params: RequestParams): Operation<T>;
}

export interface RPCEndpoint {
  notify(notification: NotificationParams): Operation<void>;
  notifications: Stream<NotificationParams, void>;

  request<T>(params: RequestParams): Operation<T>;
  requests: Stream<LSPServerRequest, void>;
}

export interface LSPAgent extends RPCEndpoint {
  initialization: InitializeResult;
  capabilities: ServerCapabilities;
}

/**
 * Represents an incoming request that the LSP server
 * is making to the client.
 */
export interface LSPServerRequest {
  (compute: (params: RequestParams) => Operation<unknown>): Operation<void>;
}

export type RequestParams = Parameters<StarRequestHandler>;
export type NotificationParams = Parameters<StarNotificationHandler>;

export interface Notification {
  readonly method: string;
  readonly params: object | any[] | undefined;
}
