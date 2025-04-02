import { main, suspend } from "effection";

import * as z from "zod";
import { parser } from "zod-opts";
import { start } from "./lib/server.ts";
import { repl } from "./lib/repl.ts";

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
        type: z.array(z.string()).min(1),
        description:
          "start and muliplex a server with specified command string",
      },
    }).parse(argv);

  if (opts.interactive) {
    let lspx = yield* start({ ...opts, commands: opts.lsp });
    yield* repl(lspx, opts.lsp);
  } else {
    let input = Deno.stdin.readable;
    let output = Deno.stdout.writable;
    yield* start({ input, output, errput, ...opts, commands: opts.lsp });

    yield* suspend();
  }
});

function errput(buffer: Uint8Array): void {
  for (let written = 0; written < buffer.length;) {
    written += Deno.stderr.writeSync(buffer.slice(written));
  }
}
