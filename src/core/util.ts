// Set появился только в ES2015 — множество строк храним как объект.
export function setOf(keys: string[]): Record<string, true> {
  const s: Record<string, true> = {};
  for (const k of keys) s[k] = true;
  return s;
}

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
