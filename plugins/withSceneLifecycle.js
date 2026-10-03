/**
 * Config plugin that adopts the UIScene life cycle on iOS.
 *
 * Apps built with the iOS 27 SDK fail to launch ("UIScene life cycle is
 * required for apps built with this SDK") unless they use a scene delegate.
 * Expo SDK 57 ships `ExpoAppSceneDelegate`, but its prebuild template still
 * uses the app-delegate-only life cycle. This backports the SDK 58 template:
 *  1. AppDelegate conforms to ExpoReactNativeFactoryProvider and no longer
 *     creates the window / starts React Native itself
 *  2. Adds ios/<AppName>/SceneDelegate.swift (subclass of ExpoAppSceneDelegate),
 *     which creates the window and starts React Native
 *  3. Declares the scene configuration in Info.plist
 *
 * Remove this plugin once on an Expo SDK whose template does this natively.
 */

const {
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
  IOSConfig,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

// The window + startReactNative block from the SDK 57 template. The scene
// delegate does this now; leaving it in would start React Native twice.
const LEGACY_WINDOW_BLOCK =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

const withSceneLifecycle = (config) => {
  // ── 1. AppDelegate ────────────────────────────────────────────────────────
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== "swift") {
      throw new Error("[withSceneLifecycle] Expected a Swift AppDelegate.");
    }
    let contents = c.modResults.contents;

    if (!contents.includes("ExpoReactNativeFactoryProvider")) {
      contents = contents.replace(
        "class AppDelegate: ExpoAppDelegate {",
        "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
      );
    }
    contents = contents.replace(
      LEGACY_WINDOW_BLOCK,
      "\n    // The window is created and React Native is started by `SceneDelegate` under the\n" +
        "    // scene-based life cycle (required by the iOS 27 SDK).",
    );

    if (
      !contents.includes("ExpoReactNativeFactoryProvider") ||
      contents.includes("UIWindow(frame: UIScreen.main.bounds)")
    ) {
      throw new Error(
        "[withSceneLifecycle] AppDelegate.swift didn't match the expected template; update this plugin.",
      );
    }

    c.modResults.contents = contents;
    return c;
  });

  // ── 2. SceneDelegate.swift ────────────────────────────────────────────────
  config = withXcodeProject(config, (c) => {
    const projectName = c.modRequest.projectName;
    const filepath = path.join(projectName, "SceneDelegate.swift");
    fs.writeFileSync(
      path.join(c.modRequest.platformProjectRoot, filepath),
      SCENE_DELEGATE_SOURCE,
    );
    if (!c.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: c.modResults,
      });
    }
    return c;
  });

  // ── 3. Info.plist ─────────────────────────────────────────────────────────
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return c;
  });

  return config;
};

module.exports = withSceneLifecycle;
