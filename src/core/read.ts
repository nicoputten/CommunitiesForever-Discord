// Reading the site's answers defensively (CLAUDE.md rule 10): every field may be missing or of another type, so each
// reader gives undefined (or an empty list) instead of throwing. Pure; shared by every file that reads the site.

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A non-empty string, trimmed. */
export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Any finite number. */
export function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A whole number from 0 up. */
export function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** Unix seconds: a whole number above 0. */
export function time(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** The non-empty strings of a list. */
export function names(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).flatMap((n) => text(n) ?? []);
}

/** The objects of a list. */
export function list(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).filter(isObject);
}

/** `{ key: value }`, or `{}` when the value is undefined (for optional fields under exactOptionalPropertyTypes). */
export function opt<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

/** At most `max` characters, the last one "…" when cut (Discord's limits). */
export function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
