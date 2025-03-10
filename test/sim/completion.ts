import type { Operation } from "effection";
import { each, main } from "effection";
import { responseError, useConnection } from "../../lib/json-rpc-connection.ts";
import type {
  CompletionItem,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver-protocol";
import { ErrorCodes } from "vscode-jsonrpc";
import { z } from "zod";
import { parser } from "zod-opts";

await main(function* (args) {
  let opts = parser()
    .name("completion simulator")
    .options({
      "triggers": {
        type: z.string().array(),
        description: "characters that trigger completion",
      },
      "say": {
        type: z.string().array(),
      },
    })
    .parse(args);

  let client = yield* useConnection({
    read: Deno.stdin.readable,
    write: Deno.stdout.writable,
  });

  // deno-lint-ignore no-explicit-any
  const routes: Record<string, (...params: any[]) => Operation<any>> = {
    *initialize(_params: InitializeParams): Operation<InitializeResult> {
      return {
        capabilities: {
          completionProvider: {
            triggerCharacters: opts.triggers ?? [],
          },
        },
        serverInfo: {
          name: "lspx simulator",
          version: "1.0",
        },
      };
    },
    *["textDocument/completion"](): Operation<CompletionItem[]> {
      return opts.say.map((label) => ({ label }));
    },
  };

  for (let respondWith of yield* each(client.requests)) {
    yield* respondWith(function* (params) {
      let [method] = params;
      let operation = routes[method];
      if (operation) {
        return yield* operation(...[params].flat());
      } else {
        return yield* responseError(
          ErrorCodes.InvalidRequest,
          `method not handled`,
        );
      }
    });
    yield* each.next();
  }
});
