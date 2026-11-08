// Packing progress, filtering, and offline storage
export function summarize(items) {
  const packed = items.filter((item) => item.packed).length;
  return { total: items.length, packed, remaining: items.length - packed };
}

export function visibleItems(items, pendingOnly) {
  return pendingOnly ? items.filter((item) => !item.packed) : items;
}

export function saveList(storage, items) {
  storage.setItem("packing-list", JSON.stringify(items));
}

export function restoreList(storage) {
  try {
    const items = JSON.parse(storage.getItem("packing-list") || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}
