import {
  createTestAdapter,
  type TestAdapter,
} from "@effection-contrib/test-adapter";

import * as bdd from "@std/testing/bdd";

export interface EffectionTestContext {
  ["@effectionx/test-adapter"]: TestAdapter;
}

export function describe(name: string, body: () => void) {
  return bdd.describe(name, () => {
    bdd.beforeAll<EffectionTestContext>(function () {
      let parent = this["@effectionx/test-adapter"];
      this["@effectionx/test-adapter"] = createTestAdapter({ name, parent });
    });
    bdd.afterAll<EffectionTestContext>(async function () {
      let current = this["@effectionx/test-adapter"];
      this["@effectionx/test-adapter"] = current.parent!;
      await current.destroy();
    });
    body();
  });
}

export type BeforeEachArgs = Parameters<TestAdapter["addSetup"]>;

export function beforeEach(...args: BeforeEachArgs): void {
  bdd.beforeEach<EffectionTestContext>(function () {
    this["@effectionx/test-adapter"].addSetup(...args);
  });
}

export type ItBody = Parameters<TestAdapter["runTest"]>[0];

export function it(name: string, body: ItBody): void {
  bdd.it<EffectionTestContext>(name, function () {
    return this["@effectionx/test-adapter"].runTest(body);
  });
}
