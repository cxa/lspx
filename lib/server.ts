import { each, type Operation, resource, spawn } from "effection";
import type { RPCEndpoint } from "./types.ts";

import { useDaemon } from "./use-command.ts";
import { useConnection } from "./json-rpc-connection.ts";
import { useMultiplexer } from "./multiplexer.ts";

export interface LSPXOptions {
  interactive?: boolean;
  input?: ReadableStream<Uint8Array>;
  output?: WritableStream<Uint8Array>;
  commands: string[];
}

export function start(opts: LSPXOptions): Operation<RPCEndpoint> {
  return resource(function* (provide) {
    let servers: RPCEndpoint[] = [];

    for (let command of opts.commands) {
      let [exe, ...args] = command.split(/\s/g);
      let process = yield* useDaemon(exe, {
        args,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });
      let server = yield* useConnection({
        read: process.stdout,
        write: process.stdin,
      });
      servers.push(server);
    }

    let multiplexer = yield* useMultiplexer({ servers });

    let client = yield* useConnection({
      read: opts.input ?? new ReadableStream(),
      write: opts.output ?? new WritableStream(),
    });

    yield* spawn(function* () {
      for (let notification of yield* each(multiplexer.notifications)) {
        yield* client.notify(notification);
        yield* each.next();
      }
    });

    yield* spawn(function* () {
      for (let respondWith of yield* each(multiplexer.requests)) {
        yield* respondWith(client.request);
        yield* each.next();
      }
    });

    yield* spawn(function* () {
      for (let respondWith of yield* each(client.requests)) {
        yield* respondWith(multiplexer.request);
        yield* each.next();
      }
    });

    yield* spawn(function* () {
      for (let notification of yield* each(client.notifications)) {
        yield* multiplexer.notify(notification);
        yield* each.next();
      }
    });

    yield* provide(multiplexer);
  });
}
