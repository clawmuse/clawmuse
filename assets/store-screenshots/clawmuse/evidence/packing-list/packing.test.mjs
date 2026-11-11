import { test } from "node:test";
import { strict as assert } from "node:assert";
import { summarize, visibleItems, saveList, restoreList } from "./packing.mjs";
const items = [
  { name: "Passport", packed: true },
  { name: "Charger", packed: false },
];
test("counts packed and remaining items", () =>
  assert.deepEqual(summarize(items), { total: 2, packed: 1, remaining: 1 }));
test("handles an empty list", () =>
  assert.deepEqual(summarize([]), { total: 0, packed: 0, remaining: 0 }));
test("filters unpacked items", () => assert.deepEqual(visibleItems(items, true), [items[1]]));
test("restores all items when filter is off", () =>
  assert.equal(visibleItems(items, false), items));
test("restores saved items after reopening", () => {
  let value;
  const storage = { setItem: (_, v) => (value = v), getItem: () => value };
  saveList(storage, items);
  assert.deepEqual(restoreList(storage), items);
});
test("recovers from invalid cache", () =>
  assert.deepEqual(restoreList({ getItem: () => "{invalid" }), []));
