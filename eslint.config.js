// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
  },
  {
    // Config plugins run in Node
    files: ["plugins/**/*.js"],
    languageOptions: {
      globals: { __dirname: "readonly", require: "readonly", module: "writable" },
    },
  },
]);
