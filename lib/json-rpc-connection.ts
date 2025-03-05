import { Readable, Writable } from "node:stream";
import { type Operation, resource, useAbortSignal } from "effection";
import * as rpc from "vscode-jsonrpc/node.js";

export type { MessageConnection } from "vscode-jsonrpc";

export interface JSONRPCConnectionOptions {
  write: WritableStream<Uint8Array>;
  read: ReadableStream<Uint8Array>;
}

export function useConnection(
  options: JSONRPCConnectionOptions,
): Operation<rpc.MessageConnection> {
  return resource(function* (provide) {
    let signal = yield* useAbortSignal();

    let readable = new rpc.StreamMessageReader(
      //@ts-expect-error 🤷
      Readable.fromWeb(options.read, { signal }),
    );
    let writable = new rpc.StreamMessageWriter(
      Writable.fromWeb(options.write, { signal }),
    );

    let connection = rpc.createMessageConnection(readable, writable);

    connection.listen();
    try {
      yield* provide(connection);
    } finally {
      readable.dispose();
      writable.dispose();
      connection.dispose();
    }
  });
}
