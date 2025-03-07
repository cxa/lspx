import { createContext, Err, Ok, type Operation, type Result } from "effection";
import { type LSPXOptions, start } from "../mod.ts";
import { beforeEach, describe, expect, it } from "./bdd.ts";
import { useConnection } from "../lib/json-rpc-connection.ts";
import { useStreamPair } from "./stream-pair.ts";
import type {
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver-protocol";
import type { RPCEndpoint } from "../lib/types.ts";

import { useCancellationToken } from "../lib/cancellation-token.ts";

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

    it("does not allow initialize to be sent more than once", function* () {
      yield* request("initialize", { capabilities: {} });
      expect(yield* request("initialize", { capabilities: {} })).toBeErr(
        "initialize invoked twice",
      );
    });

    it("forwards requests after initalization", function* () {
      let result = yield* request("initialize", { capabilities: {} });
      expect(result).toBeOk();
      expect(result).toMatchObject({
        value: {
          capabilities: {
            hoverProvider: true,
          },
        },
      });
    });
  });

  describe("completion capabilities", () => {
    it.skip("merges completion capabilities", function* () {
      yield* initServer({
        commands: [
          "deno -A test/sim/completion.ts --triggers a,b,c",
          "deno -A test/sim/completion.ts --triggers x,y,z",
        ],
      });
      expect(yield* capabilities()).toMatchObject({
        "completionProvider": {
          "triggerCharacters": [
            "a",
            "b",
            "c",
            "x",
            "y",
            "z",
          ],
        },
      });
    });
    it("merges capabilities from all servers");
  });

  describe("shutdown and exit", () => {
    it("forwards the shutdown request to all sub servers");
    it("forwars the exit request to all subservers and then exits itself");
  });

  describe("client/registerCapability", () => {
    it("always forwards dynamic registrations requests to the client");
    it("always forwards dynamic unregistrations requests to the client");
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

const Connection = createContext<RPCEndpoint>("lspx");

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

export function* capabilities(): Operation<ServerCapabilities> {
  let { capabilities } = unbox(
    yield* request<InitializeResult>("initialize", {}),
  );
  return capabilities;
}

export function unbox<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  } else {
    throw result.error;
  }
}

export function* request<T>(
  method: string,
  params: object,
): Operation<Result<T>> {
  let connection = yield* Connection.expect();
  let token = yield* useCancellationToken();
  try {
    return Ok(yield* connection.request([method, params, token]));
  } catch (error) {
    return Err(error as Error);
  }
}
