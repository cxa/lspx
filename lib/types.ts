import type { Operation, Stream } from "effection";
import type {
  StarNotificationHandler,
  StarRequestHandler,
} from "vscode-jsonrpc";
import type {
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver-protocol";

/**
 * Holds a reference to the remote end of an LSP conversation. It is
 * used to represent both the connection to the upstream client, as
 * well as the connections to all of the servers that being
 * multiplexed.
 */
export interface RPCEndpoint {
  /**
   * Send a notification to the remote endpoint.
   */
  notify(notification: NotificationParams): Operation<void>;

  /**
   * A stream of notifications that the remote endpoint is sending to us
   */
  notifications: Stream<NotificationParams, void>;

  /**
   * Send a request to the remote endpoint
   */
  request<T>(params: RequestParams): Operation<T>;

  /**
   * A stream of requests that the remote endpoint is sending to us.
   */
  requests: Stream<LSPServerRequest, void>;
}

/**
 * An initialized LSP Server whose capabilities are known. It can be
 * used to match against incoming notifications and requsets.
 */
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
