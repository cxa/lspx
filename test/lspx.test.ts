import {
  call,
  createContext,
  Err,
  Ok,
  type Operation,
  type Result,
} from "effection";
import { type LSPXOptions, start } from "../server.ts";
import { beforeEach, describe, expect, it } from "./bdd.ts";
import {
  type MessageConnection,
  useConnection,
} from "../json-rpc-connection.ts";
import { useStreamPair } from "./stream-pair.ts";

describe("lspx", function () {
  describe("initialization", () => {
    beforeEach(function* () {
      yield* initServer({
        commands: [
          "deno run -A test/sim/initialize.ts",
        ],
      });
    });

    it("returns an error code: -32002 if a request is made before initialize", function* () {
      let response = yield* request("textDocument/didOpen", {
        textDocument: {},
      });
      expect(response).toBeErr("server not initialized");
    });

    it("does not allow initialize to be sent more than once", function*() {
      yield* request("initialize", { capabilities: {} });
      expect(yield* request("initialize", { capabilities: {} })).toBeErr("initialize invoked twice");
    });

    it("merges capabilities from all servers");
  });

  describe("client/registerCapability", () => {
    it("always forwards dynamic registrations requests to the client");
    it("always forwards dynamic unregistrations requests to the client");
  });

  describe("shutdown and exit", () => {
    it("forwards the shutdown request to all sub servers");
    it("forwars the exit request to all subservers and then exits itself");
  });

  it(
    "only sends textDocumentSync notificatios to those servers that support openClose",
  );

  describe("notifications", () => {
    it("forwards all notifications from client to server");
  });

  describe("by default", () => {
    it("forwards all requests to every client");
  });
});

const Connection = createContext<MessageConnection>("lspx");

export function* initServer(options: LSPXOptions): Operation<void> {
  let input = yield* useStreamPair<Uint8Array>();
  let output = yield* useStreamPair<Uint8Array>();

  yield* start({
    ...options,
    interactive: false,
    input: input.readable,
    output: output.writable,
  });

  let connection = yield* useConnection({
    read: output.readable,
    write: input.writable,
  });

  yield* Connection.set(connection);
}

export function* request<T>(
  method: string,
  params: unknown,
): Operation<Result<T>> {
  let connection = yield* Connection.expect();

  try {
    return Ok(yield* call(() => connection.sendRequest(method, params)));
  } catch (error) {
    return Err(error as Error);
  }
}
