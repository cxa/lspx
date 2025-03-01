import { call, type Operation, resource } from "effection";

export function useCommand(
  ...params: ConstructorParameters<typeof Deno.Command>
): Operation<Deno.ChildProcess> {
  let [name, options] = params;
  return resource(function* (provide) {
    let controller = new AbortController();
    let { signal } = controller;
    let command = new Deno.Command(name, {
      ...options,
      signal,
    });
    let process = command.spawn();
    try {
      yield* provide(process);
    } finally {
      controller.abort();
      yield* call(() => process.status);
    }
  });
}
