import {
  createQueue,
  type Operation,
  resource,
  spawn,
  withResolvers,
} from "effection";

export interface StreamPair<T> {
  writable: WritableStream<T>;
  readable: ReadableStream<T>;
}

export function useStreamPair<T>(): Operation<StreamPair<T>> {
  return resource(function* (provide) {
    let queue = createQueue<T, void>();

    let writable = new WritableStream<T>({
      start() {},
      write(chunk) {
        queue.add(chunk);
      },
      close() {
        queue.close();
      },
    });

    let { operation: started, resolve: start } = withResolvers<
      ReadableStreamDefaultController
    >();

    yield* spawn(function* pump(): Operation<void> {
      let controller = yield* started;
      let next = yield* queue.next();
      while (!next.done) {
        controller.enqueue(next.value);
        next = yield* queue.next();
      }
    });

    let readable = new ReadableStream({ start });

    try {
      yield* provide({ writable, readable });
    } finally {
      if (!writable.locked) {
        writable.abort();
      }
    }
  });
}
