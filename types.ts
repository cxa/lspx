// deno-lint-ignore-file no-explicit-any
import type { Operation, Stream } from "effection";
import type { StarRequestHandler } from "vscode-jsonrpc";

export interface LSPXServer {
  notifications: Stream<Notification, never>;
  request<T>(...params: RequestParams): Operation<T>;
}

export type RequestParams = Parameters<StarRequestHandler>;

export interface Notification {
  readonly method: string;
  readonly params: object | any[] | undefined;
}

export interface Disposable {
  dispose(): void;
}
