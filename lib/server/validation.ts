/** Zod 4 applies inner defaults even under .partial(); PATCH may only alter submitted keys. */
export function submittedFields<T extends object>(parsed: T, input: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(input, key))) as T;
}
