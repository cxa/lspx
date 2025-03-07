import { createContext, type Operation } from "effection";

export interface Disposable {
  dispose(): void;
}

const DisposableContext = createContext<Disposable[]>("disposables");

export function disposableScope<T, TArgs extends unknown[]>(
  body: (...args: TArgs) => Operation<T>,
): (...args: TArgs) => Operation<T> {
  return (...args) =>
    DisposableContext.with([], function* (disposables) {
      try {
        return yield* body(...args);
      } finally {
        for (let disposable of disposables) {
          disposable.dispose();
        }
      }
    });
}

export function* disposable<T extends Disposable>(disposable: T): Operation<T> {
  let disposables = yield* DisposableContext.expect();
  disposables.unshift(disposable);
  return disposable;
}
