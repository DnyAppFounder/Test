import { Buffer } from 'buffer';
// @ts-ignore - process/browser doesn't have types
import process from 'process/browser';

const g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {}) as any;

if (!g.Buffer) {
  g.Buffer = Buffer;
}

if (!g.process) {
  g.process = process;
}

if (!g.process.version) {
  g.process.version = 'v18.0.0';
}

if (!g.process.versions) {
  (g.process as any).versions = { node: '18.0.0' };
}

if (!g.process.nextTick) {
  g.process.nextTick = ((fn: (...args: any[]) => void, ...args: any[]) => {
    setTimeout(() => fn(...args), 0);
  }) as any;
}

if (!g.global) {
  g.global = g;
}

if (typeof crypto !== 'undefined' && !crypto.getRandomValues) {
  crypto.getRandomValues = ((arr: any) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }) as any;
}

export {};
