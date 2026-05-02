const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.serializer = {
  ...config.serializer,
  getPolyfills: () => {
    const defaultPolyfills = require('@react-native/js-polyfills')();
    return [
      path.resolve(__dirname, 'global-shim.js'),
      ...defaultPolyfills,
    ];
  },
};

// Path to the safe readable-stream v3 (no process.version.slice() crash)
const safeReadableStream = path.resolve(
  __dirname,
  'node_modules/stream-browserify/node_modules/readable-stream'
);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: require.resolve('stream-browserify'),
  process: require.resolve('process/browser.js'),
  buffer: require.resolve('buffer/'),
  'readable-stream': safeReadableStream,
  crypto: path.resolve(__dirname, 'lib/crypto-shim.js'),
};

// Intercept readable-stream requires to always use v3 (safe for browser)
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'readable-stream') {
    return context.resolveRequest(context, safeReadableStream, platform);
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
