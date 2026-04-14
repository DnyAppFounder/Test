var processShim = {
  env: {},
  version: 'v18.0.0',
  versions: { node: '18.0.0' },
  browser: true,
  nextTick: function(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    setTimeout(function() { fn.apply(null, args); }, 0);
  },
  platform: 'browser',
  stdout: null,
  stderr: null,
  cwd: function() { return '/'; },
  title: 'browser',
  on: function() {},
  addListener: function() {},
  once: function() {},
  off: function() {},
  removeListener: function() {},
  removeAllListeners: function() {},
  emit: function() {},
  listeners: function() { return []; },
  binding: function() { throw new Error('process.binding is not supported'); },
  umask: function() { return 0; },
};

function ensureProcess(g) {
  if (!g) return;
  if (!g.process) {
    g.process = processShim;
  } else {
    if (!g.process.version) g.process.version = 'v18.0.0';
    if (!g.process.versions) g.process.versions = { node: '18.0.0' };
    if (g.process.browser === undefined) g.process.browser = true;
    if (!g.process.nextTick) {
      g.process.nextTick = function(fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        setTimeout(function() { fn.apply(null, args); }, 0);
      };
    }
    if (!g.process.cwd) g.process.cwd = function() { return '/'; };
    if (!g.process.env) g.process.env = {};
  }
}

if (typeof global !== 'undefined') ensureProcess(global);
if (typeof globalThis !== 'undefined') ensureProcess(globalThis);
if (typeof window !== 'undefined') ensureProcess(window);
if (typeof self !== 'undefined') ensureProcess(self);
