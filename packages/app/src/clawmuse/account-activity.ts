const accountChangeListeners = new Set<() => void | Promise<void>>();
export function subscribeAccountChange(listener: () => void | Promise<void>): () => void {
  accountChangeListeners.add(listener);
  return () => {
    accountChangeListeners.delete(listener);
  };
}
export async function resetAccountActivity(): Promise<void> {
  const errors: unknown[] = [];
  for (const listener of accountChangeListeners) {
    try {
      await listener();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "Failed to clear account activity");
}
