import { each, main } from "effection";
import { useConnection } from "../../lib/json-rpc-connection.ts";
import { constant } from "https://jsr.io/@effection/effection/4.0.0-alpha.7/lib/constant.ts";

await main(function* () {
  let client = yield* useConnection({
    read: Deno.stdin.readable,
    write: Deno.stdout.writable,
  });

  for (let respond of yield* each(client.requests)) {
    yield* respond(() =>
      constant({
        capabilities: {
          hoverProvider: true,
        },
        serverInfo: {
          name: "lspx simulator",
          version: "1.0",
        },
      })
    );
    yield* each.next();
  }
});
