/**
 * Injectable clock. Repositories take a Clock so tests can pin time and so the
 * distinction between real-world time (occurred_at) and row time (created_at/
 * updated_at) stays explicit.
 */
export type Timestamp = string; // ISO-8601

export interface Clock {
  now(): Timestamp;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

/** A fixed clock for deterministic tests. */
export function fixedClock(iso: Timestamp): Clock {
  return { now: () => iso };
}
