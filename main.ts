import {
  call,
  createSignal,
  main,
  type Operation,
  resource,
  type Stream,
} from "effection";

import * as rpc from "vscode-jsonrpc/node.js";
import { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";
import * as z from "zod";
import { parser } from "zod-opts";

await main(function* (argv) {
  let opts = parser()
    .name("lspx")
    .options({
      "interactive": {
        type: z.boolean().default(false),
        alias: "i",
        description: "start an interactive session with a multiplexed system",
      },
      "lsp": {
        type: z.array(z.string()),
        description:
          "start and muliplex a server with specified command string",
      },
    }).parse(argv);
  console.log(opts);
});

export function useCommand(
  ...params: ConstructorParameters<typeof Deno.Command>
): Operation<Deno.ChildProcess> {
  let [name, options] = params;
  return resource(function* (provide) {
    let controller = new AbortController();
    let { signal } = controller;
    let command = new Deno.Command(name, {
      ...options,
      signal,
    });
    let process = command.spawn();
    try {
      yield* provide(process);
    } finally {
      controller.abort();
      yield* call(() => process.status);
    }
  });
}

export interface ConnectionOptions {
  write: WritableStream<Uint8Array>;
  read: ReadableStream<Uint8Array>;
}

export function useConnection(
  options: ConnectionOptions,
): Operation<rpc.MessageConnection> {
  return resource(function* (provide) {
    const connection = rpc.createMessageConnection(
      //@ts-expect-error 🤷
      new rpc.StreamMessageReader(Readable.fromWeb(options.read)),
      new rpc.StreamMessageWriter(Writable.fromWeb(options.write)),
    );
    connection.listen();
    try {
      yield* provide(connection);
    } finally {
      connection.dispose();
    }
  });
}

export function useReadline(
  ...args: Parameters<typeof createInterface>
): Stream<string, never> {
  return resource(function* (provide) {
    let rl = createInterface(...args);
    let lines = createSignal<string, never>();

    let subscription = yield* lines;
    try {
      rl.on("line", lines.send);
      yield* provide({
        *next() {
          rl.prompt();
          return yield* subscription.next();
        },
      });
    } finally {
      rl.off("line", lines.send);
      rl.close();
    }
  });
}
