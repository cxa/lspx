import type { Operation } from "effection";
import { main, suspend, useScope } from "effection";
import { useConnection } from "../../json-rpc-connection.ts";
import type {
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver-protocol";
import { ErrorCodes, ResponseError } from "vscode-jsonrpc";

await main(function* () {
  let client = yield* useConnection({
    read: Deno.stdin.readable,
    write: Deno.stdout.writable,
  });

  const routes: Record<string, (...params: any[]) => Operation<any>> = {
    *initialize(_params: InitializeParams): Operation<InitializeResult> {
      return {
        capabilities: {
          hoverProvider: true,
        },
        serverInfo: {
          name: "lspx simulator",
          version: "1.0",
        },
      };
    },
  };

  let scope = yield* useScope();
  let disposable = client.onRequest((method, params) => {
    let operation = routes[method];
    if (operation) {
      return scope.run(() => operation(...[params].flat()));
    } else {
      return new ResponseError(
        ErrorCodes.InvalidRequest,
        `does not implement ${method}`,
      );
    }
  });

  try {
    yield* suspend();
  } finally {
    disposable.dispose();
  }
});
