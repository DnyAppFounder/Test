// This file runs BEFORE any application/library code via Metro's getPolyfills.
// readable-stream does: process.version.slice(0, 5)
// process/browser.js sets process.version = '' (empty string) which is safe,
// but if process is undefined or version is undefined the app crashes.
// This shim guarantees process exists with all needed properties.

(function() {
  var g = typeof globalThis !== 'undefined' ? globalThis :
          typeof global !== 'undefined' ? global :
          typeof window !== 'undefined' ? window :
          typeof self !== 'undefined' ? self : {};

  if (!g.process) {
    g.process = {};
  }

  var p = g.process;

  // CRITICAL: version must be a non-empty string for .slice() to work
  if (!p.version || typeof p.version !== 'string' || p.version.length === 0) {
    p.version = 'v18.0.0';
  }
  if (!p.versions) p.versions = { node: '18.0.0' };
  if (!p.env) p.env = {};
  if (p.browser === undefined) p.browser = true;
  if (!p.platform) p.platform = 'browser';
  if (!p.title) p.title = 'browser';

  if (!p.nextTick) {
    p.nextTick = function(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      setTimeout(function() { fn.apply(null, args); }, 0);
    };
  }

  if (!p.cwd) p.cwd = function() { return '/'; };
  if (!p.stdout) p.stdout = null;
  if (!p.stderr) p.stderr = null;
  if (!p.on) p.on = function() { return p; };
  if (!p.addListener) p.addListener = function() { return p; };
  if (!p.once) p.once = function() { return p; };
  if (!p.off) p.off = function() { return p; };
  if (!p.removeListener) p.removeListener = function() { return p; };
  if (!p.removeAllListeners) p.removeAllListeners = function() { return p; };
  if (!p.emit) p.emit = function() { return false; };
  if (!p.listeners) p.listeners = function() { return []; };
  if (!p.binding) p.binding = function() { throw new Error('process.binding is not supported'); };
  if (!p.umask) p.umask = function() { return 0; };

  // Ensure global reference exists
  if (!g.global) g.global = g;

  // Also patch the process/browser module if it was already required
  // and set version to empty string
  if (typeof module !== 'undefined' && typeof require !== 'undefined') {
    try {
      var proc = require('process');
      if (proc && (!proc.version || proc.version.length === 0)) {
        proc.version = 'v18.0.0';
      }
      if (proc && !proc.versions) {
        proc.versions = { node: '18.0.0' };
      }
      if (proc && proc.browser === undefined) {
        proc.browser = true;
      }
    } catch(e) {}
  }
})();
