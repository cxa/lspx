// deno-lint-ignore-file no-explicit-any
import type { Operation, Stream } from "effection";

export interface LSPXServer {
  notifications: Stream<Notification, never>;
  request<T>(method: string, ...params: unknown[]): Operation<T | undefined>;
}

export interface Notification {
  readonly method: string;
  readonly params: object | any[] | undefined;
}

export interface Disposable {
  dispose(): void;
}
