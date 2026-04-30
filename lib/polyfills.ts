import { Buffer } from 'buffer';

const g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {}) as any;

if (!g.Buffer) {
  g.Buffer = Buffer;
}

// Ensure process.version exists (readable-stream calls process.version.slice() at init)
if (!g.process) {
  g.process = {} as any;
}
if (!g.process.version) {
  g.process.version = 'v18.0.0';
}
if (!g.process.versions) {
  g.process.versions = { node: '18.0.0' };
}
if (!g.process.env) {
  g.process.env = {};
}
if (!g.process.nextTick) {
  g.process.nextTick = ((fn: (...args: any[]) => void, ...args: any[]) => {
    setTimeout(() => fn(...args), 0);
  }) as any;
}
if (!g.process.cwd) {
  g.process.cwd = () => '/';
}
if (!g.process.browser) {
  g.process.browser = true;
}

if (!g.global) {
  g.global = g;
}

export {};
