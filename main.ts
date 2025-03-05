import { exit, main } from "effection";

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

  let lspx = yield* start({ ...opts, commands: opts.lsp });

  if (opts.interactive) {
    yield* repl(lspx);
  } else {
    yield* exit(1, "non-interactive sessions not supported yet");
  }
});
