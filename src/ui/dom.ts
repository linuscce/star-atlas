export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// querySelectorAll(...).forEach есть только с Chrome 51 — обходим список вручную.
export function each(list: NodeListOf<Element>, fn: (el: HTMLElement, i: number) => void) {
  for (let i = 0; i < list.length; i++) fn(list[i] as HTMLElement, i);
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
