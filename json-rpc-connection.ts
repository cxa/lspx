import { Readable, Writable } from "node:stream";
import { type Operation, resource } from "effection";
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
    let connection = rpc.createMessageConnection(
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
