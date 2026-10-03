const { withXcodeProject } = require("expo/config-plugins");

const withStrictXcodeSettings = (config) => {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();

    // Grab the exact versions from the config below
    const version = config.version;
    const buildNumber = config.ios.buildNumber;

    for (const key in configurations) {
      const buildSettings = configurations[key].buildSettings;

      if (buildSettings && typeof buildSettings === "object") {
        // 1. Force exact versioning across all targets
        buildSettings.MARKETING_VERSION = `"${version}"`;
        buildSettings.CURRENT_PROJECT_VERSION = `"${buildNumber}"`;

        // 2. Force iPhone ONLY (1 = iPhone)
        buildSettings.TARGETED_DEVICE_FAMILY = '"1"';

        // 3. Explicitly disable "Mac (Designed for iPad)" and Apple Vision
        buildSettings.SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = '"NO"';
        buildSettings.SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = '"NO"';
      }
    }

    return config;
  });
};

module.exports = {
  expo: {
    name: "jim",
    slug: "jim",
    version: "1.1.1",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "jim",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.jaredkrajewski.jim",
      appleTeamId: "UQ6CB8CM9T",
      buildNumber: "13",
      // Declares that the app uses only standard iOS/HTTPS encryption (exempt).
      // This auto-answers the App Store encryption compliance question on upload.
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.jaredkrajewski.jim",
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      "expo-router",
      "expo-sqlite",
      "@bacons/apple-targets",
      "./plugins/withLiveTimerModule",
      "./plugins/withSceneLifecycle",
      [
        "expo-notifications",
        {
          sounds: ["./assets/audio/cat_meow_short.wav"],
        },
      ],
      withStrictXcodeSettings, // <-- Hooking into the build process here
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "4c5060d2-7fde-49a6-8698-d9d470edb65a",
      },
    },
  },
};
