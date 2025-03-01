import { createInterface } from "node:readline";
import { createSignal, resource, type Stream } from "effection";

export function readline(
  ...args: Parameters<typeof createInterface>
): Stream<string, never> {
  return resource(function* (provide) {
    let rl = createInterface(...args);
    let lines = createSignal<string, never>();

    let subscription = yield* lines;
    try {
      rl.on("line", lines.send);
      yield* provide({
        *next() {
          rl.prompt();
          return yield* subscription.next();
        },
      });
    } finally {
      rl.off("line", lines.send);
      rl.close();
    }
  });
}
