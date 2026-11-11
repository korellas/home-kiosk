// Reuse unchanged parts of a newly mapped, plain-data snapshot.
export function reuseUnchanged<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (
    !previous ||
    !next ||
    typeof previous !== "object" ||
    typeof next !== "object" ||
    Array.isArray(previous) !== Array.isArray(next)
  )
    return next;
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  let unchanged = keys.length === Object.keys(before).length;
  for (const key of keys) {
    after[key] = reuseUnchanged(before[key], after[key]);
    if (!Object.hasOwn(before, key) || !Object.is(before[key], after[key]))
      unchanged = false;
  }
  return unchanged ? previous : next;
}
