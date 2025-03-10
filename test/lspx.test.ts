import { createContext, Err, Ok, type Operation, type Result } from "effection";
import { type LSPXOptions, start } from "../mod.ts";
import { assertOk, beforeEach, describe, expect, it } from "./bdd.ts";
import { useConnection } from "../lib/json-rpc-connection.ts";
import { useStreamPair } from "./stream-pair.ts";
import type {
  ClientCapabilities,
  CompletionContext,
  CompletionItem,
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver-protocol";
import type { RPCEndpoint } from "../lib/types.ts";

import { useCancellationToken } from "../lib/cancellation-token.ts";

describe("lspx", function () {
  describe("lifecycle", () => {
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

    it("does not allow further requests after shutdown", function* () {
      expect(yield* request("initialize", { capabilities: {} })).toBeOk();
      expect(yield* request("shutdown", {})).toBeOk();
      expect(
        yield* request("textDocument/definition", {
          position: { line: 0, character: 0 },
        }),
      ).toBeErr("server is shut down");
    });
  });

  describe("completion", () => {
    beforeEach(function* () {
      yield* initServer({
        commands: [
          "deno -A test/sim/completion.ts --triggers a b c --say alpha",
          "deno -A test/sim/completion.ts --triggers c d e --say omega",
        ],
      });
      yield* initialize({ textDocument: { completion: {} } });
    });
    it("merges completion capabilities", function* () {
      expect(yield* capabilities()).toMatchObject({
        "completionProvider": {
          "triggerCharacters": [
            "a",
            "b",
            "c",
            "c",
            "d",
            "e",
          ],
        },
      });
    });
    it("sends the request to both if both match the trigger", function* () {
      let result = yield* request<CompletionItem[]>("textDocument/completion", {
        context: {
          triggerCharacter: "c",
        } as CompletionContext,
      });
      assertOk(result);
      let { value: items } = result;
      expect(items.map(({ label }) => label)).toEqual(["alpha", "omega"]);
    });

    it("only sends the request to one if only one trigger matches", function* () {
      let result = yield* request<CompletionItem[]>("textDocument/completion", {
        context: {
          triggerCharacter: "e",
        } as CompletionContext,
      });
      assertOk(result);
      let { value: items } = result;
      expect(items.map(({ label }) => label)).toEqual(["omega"]);
    });

    it("sends the reuest to all if there is no trigger specified", function* () {
      let result = yield* request<CompletionItem[]>("textDocument/completion", {
        context: {} as CompletionContext,
      });
      assertOk(result);
      let { value: items } = result;
      expect(items.map(({ label }) => label)).toEqual(["alpha", "omega"]);
    });
  });

  describe("hover", () => {
    beforeEach(function* () {
      yield* initServer({
        commands: [
          "deno -A test/sim/hover.ts",
          "deno -A test/sim/hover.ts",
        ],
      });
      yield* initialize({ textDocument: { hover: {} } });
    });

    it("can handle a null response from all the servers", function* () {
      let result = yield* request("textDocument/hover", {
        textDocument: {
          uri: "file:///Users/cowboyd/Code/@cowboyd/lsps/test/lspx.test.ts",
        },
        position: { line: 126, character: 12 },
      });
      expect(result).toEqual({ ok: true, value: null });
    });
  });

  describe("client/registerCapability", () => {
    it("forwards dynamic registrations requests to the client");
    it("forwards dynamic unregistrations requests to the client");
  });

  it(
    "only sends textDocumentSync notificatios to those servers that support openClose",
  );

  describe("notifications", () => {
    it("forwards all notifications from all servers to the client");
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

const Capabilities = createContext<ServerCapabilities>("capabilities");

export function* initialize(
  caps: ClientCapabilities = {},
): Operation<ServerCapabilities> {
  let { capabilities } = unbox(
    yield* request<InitializeResult>("initialize", caps),
  );
  return yield* Capabilities.set(capabilities);
}

export function* capabilities(): Operation<ServerCapabilities> {
  return yield* Capabilities.expect();
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
