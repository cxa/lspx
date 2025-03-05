import { type Operation, useAbortSignal } from "effection";
import type { CancellationToken } from "vscode-jsonrpc";

export function* useCancellationToken(): Operation<CancellationToken> {
  let signal = yield* useAbortSignal();

  return {
    get isCancellationRequested() {
      return signal.aborted;
    },
    onCancellationRequested(listener) {
      signal.addEventListener("abort", listener);
      return {
        dispose: () => signal.removeEventListener("abort", listener),
      };
    },
  };
}
