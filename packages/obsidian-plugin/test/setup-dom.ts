/**
 * Minimal Obsidian HTMLElement helpers for jsdom.
 * Production code uses these methods; they exist on Obsidian's DOM prototypes.
 */

type DomElementInfo = {
  cls?: string;
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
};

type ObsidianElement = HTMLElement & {
  empty(): void;
  addClass(...classes: string[]): void;
  removeClass(...classes: string[]): void;
  createDiv(o?: DomElementInfo | string): HTMLDivElement;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
  ): HTMLElementTagNameMap[K];
};

function applyInfo(el: HTMLElement, o?: DomElementInfo | string): void {
  if (typeof o === 'string') {
    el.className = o;
    return;
  }
  if (!o) return;
  if (o.cls) el.className = o.cls;
  if (o.text !== undefined) el.textContent = o.text;
  if (o.attr) {
    for (const [key, value] of Object.entries(o.attr)) {
      if (value === null) el.removeAttribute(key);
      else el.setAttribute(key, String(value));
    }
  }
}

const proto = HTMLElement.prototype as ObsidianElement;

if (typeof proto.empty !== 'function') {
  proto.empty = function empty(this: HTMLElement): void {
    this.replaceChildren();
  };
}

if (typeof proto.addClass !== 'function') {
  proto.addClass = function addClass(this: HTMLElement, ...classes: string[]): void {
    this.classList.add(...classes);
  };
}

if (typeof proto.removeClass !== 'function') {
  proto.removeClass = function removeClass(this: HTMLElement, ...classes: string[]): void {
    this.classList.remove(...classes);
  };
}

if (typeof proto.createEl !== 'function') {
  proto.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tag: K,
    o?: DomElementInfo | string,
  ): HTMLElementTagNameMap[K] {
    const el = this.ownerDocument.createElement(tag);
    applyInfo(el, o);
    this.appendChild(el);
    return el;
  };
}

if (typeof proto.createDiv !== 'function') {
  proto.createDiv = function createDiv(
    this: HTMLElement,
    o?: DomElementInfo | string,
  ): HTMLDivElement {
    return this.createEl('div', o);
  };
}
