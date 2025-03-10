import type { RPCEndpoint } from "./types.ts";
import { readline } from "./readline.ts";
import process from "node:process";
import completions from "./completions.json" with { type: "json" };
import { each } from "effection";
import { useCancellationToken } from "./cancellation-token.ts";

export function* repl(server: RPCEndpoint, commands: string[]) {
  let lines = readline({
    prompt: "LSP> ",
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => {
      let hits = completions.filter((c) => c.startsWith(line));
      // Show all completions if none foundp
      return [hits.length ? hits : completions, line];
    },
  });

  if (commands.length) {
    console.log(`x
|
${commands.map((c) => `+-> ${c}`).join("\n")}`);
  }

  for (let line of yield* each(lines)) {
    let pattern = /([\w\/]+)\((.*)\)/;
    let match = pattern.exec(line);
    if (match) {
      try {
        let method = match[1];
        let args = JSON.parse(`[${match[2]}]`);
        console.log(
          `Sending request ${method} with params ${JSON.stringify(args)}...`,
        );

        let token = yield* useCancellationToken();

        let arg = args.length === 1 ? args[0] : args;

        let response = yield* server.request([method, arg, token]);

        console.log(JSON.stringify(response, null, 2));
      } catch (e) {
        console.log(e);
      }
    } else {
      console.log(
        'invoke an LSP command. Example: initialize({"capabilities": {}})',
      );
    }
    yield* each.next();
  }
}
