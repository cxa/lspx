import { call, createSignal, type Operation, resource } from "effection";
import type { Disposable, LSPXServer, Notification } from "./types.ts";

import { useCommand } from "./use-command.ts";
import { useConnection } from "./json-rpc-connection.ts";
import type { MessageConnection } from "vscode-jsonrpc";

export interface Options {
  interactive: boolean;
  commands: string[];
}

export function start(opts: Options): Operation<LSPXServer> {
  return resource(function* (provide) {
    let notifications = createSignal<Notification, never>();
    let connections: MessageConnection[] = [];
    let disposables: Disposable[] = [];
    try {
      for (let command of opts.commands) {
        let [exe, ...args] = command.split(/\s/g);
        let process = yield* useCommand(exe, {
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
      yield* provide({
        notifications,
        *request<T>(method: string, ...params: unknown[]) {
          for (let connection of connections) {
            return (yield* call(() =>
              connection.sendRequest(method, ...params)
            )) as T;
          }
        },
      });
    } finally {
      for (let disposable of disposables) {
        disposable.dispose();
      }
    }
  });
}
