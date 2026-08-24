/* eslint-disable no-undef -- Babel bu dosyayı CommonJS olarak require eder. */
module.exports = function babelConfig(api) {
  api.cache(true)
  return { presets: ['babel-preset-expo'] }
}
