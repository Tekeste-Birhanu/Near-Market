import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

// Mock IntersectionObserver for lazy image loading tests.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    // Immediately trigger intersection for all observed elements in tests.
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this);
  }

  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }

  get scrollMargin() {
    return "";
  }
}

beforeAll(() => {
  global.IntersectionObserver = MockIntersectionObserver as any;
});

afterEach(() => cleanup());
