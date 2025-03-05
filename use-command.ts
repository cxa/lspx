import { call, type Operation, resource, spawn } from "effection";

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

export function* useDaemon(
  ...params: Parameters<typeof useCommand>
): Operation<Deno.ChildProcess> {
  let process = yield* useCommand(...params);

  yield* spawn(function* () {
    let status = yield* call(() => process.status);
    let [command, options] = params;
    let error = new Error(
      `${command}${options?.args ? " " + options.args.join(" ") : ""}`,
      { cause: status },
    );
    error.name = `DaemonExitError`;
    throw error;
  });

  return process;
}
