import type { Operation, Stream } from "effection";
import type {
  StarNotificationHandler,
  StarRequestHandler,
} from "vscode-jsonrpc";
import type {
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver-protocol";
import type { Middleware } from "./middleware.ts";

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
  notifications: Stream<LSPServerNotification, void>;

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
  name: string;
  initialization: InitializeResult;
  capabilities: ServerCapabilities;
}

/**
 * A multiplexing request dispatched from a client to multiple lsp servers
 */
export interface XClientRequest {
  params: RequestParams;
  agents: LSPAgent[];
}

/**
 * A multiplexing notification dispatched from a client to multiple lsp servers
 */
export interface XClientNotification {
  params: NotificationParams;
  agents: LSPAgent[];
}

/**
 * A request dispatched from one of many servers to a client.
 */
export interface XServerRequest {
  params: RequestParams;
  agent: LSPAgent;
}

/**
 * A notification dispatched from one of many servers to a client
 */
export interface XServerNotification {
  params: NotificationParams;
  agent: LSPAgent;
}

/**
 * Represents an incoming request that one of the LSP server agents
 * is making to the client.
 */
export interface LSPServerRequest {
  (compute: (params: RequestParams) => Operation<unknown>): Operation<void>;
}

/**
 * Represents an incoming notification that one of the LSP server agents
 * is making to the client.
 */
export interface LSPServerNotification {
  (compute: (params: NotificationParams) => Operation<void>): Operation<void>;
}

export type RequestParams = Parameters<StarRequestHandler>;
export type NotificationParams = Parameters<StarNotificationHandler>;

export interface LSPXMiddleware {
  client2Server: {
    request: Middleware<XClientRequest, unknown>;
    notify: Middleware<XClientNotification, void>;
  };
  server2Client: {
    request: Middleware<XServerRequest, unknown>;
    notify: Middleware<XServerNotification, void>;
  };
}
