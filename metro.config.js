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

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: require.resolve('stream-browserify'),
  process: require.resolve('process/browser.js'),
};

module.exports = config;
