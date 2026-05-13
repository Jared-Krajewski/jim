// https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Treat .wasm files as static assets so Metro doesn't try to resolve them
// as JS modules (defensive: covers any transitive wasm imports)
config.resolver.assetExts.push("wasm");

// Stub native-only modules on web so the browser bundle doesn't attempt to
// load expo-sqlite's wa-sqlite OPFS worker (which fails without special
// COOP/COEP headers that the Metro dev server doesn't set).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    (moduleName === "expo-sqlite" || moduleName.startsWith("expo-sqlite/"))
  ) {
    return { type: "empty" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
