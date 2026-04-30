// This file runs BEFORE any application/library code via Metro's getPolyfills.
// readable-stream@2 does: process.version.slice(0, 5) using the bare global.
// We must ensure `process` is defined on all global references.

(function() {
  var g = typeof globalThis !== 'undefined' ? globalThis :
          typeof global !== 'undefined' ? global :
          typeof window !== 'undefined' ? window :
          typeof self !== 'undefined' ? self : {};

  var p = g.process || {};

  p.browser = true;
  if (!p.version || typeof p.version !== 'string') {
    p.version = 'v18.0.0';
  }
  if (!p.versions) p.versions = { node: '18.0.0' };
  if (!p.env) p.env = {};
  if (!p.platform) p.platform = 'browser';
  if (!p.title) p.title = 'browser';

  if (!p.nextTick) {
    p.nextTick = function(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      Promise.resolve().then(function() { fn.apply(null, args); });
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

  // Assign to all possible global references
  g.process = p;
  if (typeof globalThis !== 'undefined') globalThis.process = p;
  if (typeof global !== 'undefined') global.process = p;
  if (typeof window !== 'undefined') window.process = p;
  if (typeof self !== 'undefined') self.process = p;

  // Ensure global reference exists
  if (!g.global) g.global = g;
})();
