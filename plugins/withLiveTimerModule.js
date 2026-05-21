/**
 * Config plugin that wires the ActivityKit native bridge into the iOS project.
 *
 * What it does:
 *  1. Sets NSSupportsLiveActivities = true in the main app's Info.plist
 *  2. Copies LiveTimerBridge.m + LiveTimerBridge.swift into ios/<AppName>/
 *  3. Adds those files as source files in the Xcode project
 *
 * Run `npx expo prebuild --platform ios --clean` to apply.
 */

const {
  withXcodeProject,
  withInfoPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const { withFinalizedMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const BRIDGE_FILES = ["LiveTimerBridge.m", "LiveTimerBridge.swift"];
const SRC_DIR = path.join(__dirname, "ios-src");
const BRIDGING_HEADER_IMPORT = "#import <React/RCTBridgeModule.h>";
const APP_DELEGATE_TERMINATE_HOOK = `

  public override func applicationWillTerminate(_ application: UIApplication) {
    LiveTimerBridge.endAllActivitiesImmediatelySynchronously()
    super.applicationWillTerminate(application)
  }
`;

function getExistingPaths(xcodeProject) {
  return new Set(
    Object.values(xcodeProject.pbxFileReferenceSection() || {})
      .map((ref) =>
        typeof ref === "object" ? ref.path?.replace(/"/g, "") : null,
      )
      .filter(Boolean),
  );
}

function ensureReactBridgeImport(bridgingHeaderPath) {
  if (!fs.existsSync(bridgingHeaderPath)) {
    return;
  }

  const current = fs.readFileSync(bridgingHeaderPath, "utf8");
  if (current.includes(BRIDGING_HEADER_IMPORT)) {
    return;
  }

  const separator = current.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(
    bridgingHeaderPath,
    `${current}${separator}${BRIDGING_HEADER_IMPORT}\n`,
  );
}

function ensureAppDelegateTerminateHook(appDelegatePath) {
  if (!fs.existsSync(appDelegatePath)) {
    return;
  }

  const current = fs.readFileSync(appDelegatePath, "utf8");
  if (current.includes("applicationWillTerminate(_ application: UIApplication)")) {
    return;
  }

  const marker = "\n}\n\nclass ReactNativeDelegate";
  if (!current.includes(marker)) {
    console.warn(
      "[withLiveTimerModule] Could not find AppDelegate insertion point for termination hook.",
    );
    return;
  }

  const patched = current.replace(
    marker,
    `${APP_DELEGATE_TERMINATE_HOOK}\n}\n\nclass ReactNativeDelegate`,
  );
  fs.writeFileSync(appDelegatePath, patched);
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withLiveTimerModule = (config) => {
  // ── 1. Info.plist ─────────────────────────────────────────────────────────
  config = withInfoPlist(config, (c) => {
    c.modResults.NSSupportsLiveActivities = true;
    // Frequent updates aren't needed (we only start + end, no intermediate updates)
    c.modResults.NSSupportsLiveActivitiesFrequentUpdates = false;
    return c;
  });

  config = withDangerousMod(config, [
    "ios",
    async (c) => {
      const appDelegatePath = path.join(
        c.modRequest.projectRoot,
        "ios",
        c.modRequest.projectName,
        "AppDelegate.swift",
      );
      ensureAppDelegateTerminateHook(appDelegatePath);
      return c;
    },
  ]);

  // ── 2. Xcode project ──────────────────────────────────────────────────────
  config = withXcodeProject(config, (c) => {
    const xcodeProject = c.modResults;
    const projectName = c.modRequest.projectName;
    const iosRoot = path.join(c.modRequest.projectRoot, "ios");
    const appTargetDir = path.join(iosRoot, projectName);
    const bridgingHeaderPath = path.join(
      appTargetDir,
      `${projectName}-Bridging-Header.h`,
    );
    const targetKey = xcodeProject.findTargetKey(projectName);

    // Ensure ios/ directory exists (it should after prebuild scaffold)
    if (!fs.existsSync(iosRoot) || !targetKey) {
      console.warn(
        "[withLiveTimerModule] iOS project not ready, skipping file copy.",
      );
      return c;
    }

    ensureReactBridgeImport(bridgingHeaderPath);

    const groupKey = xcodeProject.findPBXGroupKey({ name: projectName });
    if (!groupKey) {
      console.warn(
        "[withLiveTimerModule] Could not find Xcode group, skipping file linking.",
      );
      return c;
    }

    // Helper: copy a file and add it as a source in the main app target
    const addSwiftSource = (src, filename) => {
      if (!fs.existsSync(src)) {
        console.warn(`[withLiveTimerModule] Source file not found: ${src}`);
        return;
      }
      const dest = path.join(iosRoot, filename);
      fs.copyFileSync(src, dest);
      const existingPaths = getExistingPaths(xcodeProject);
      if (!existingPaths.has(filename)) {
        xcodeProject.addSourceFile(filename, { target: targetKey }, groupKey);
      }
    };

    for (const filename of BRIDGE_FILES) {
      addSwiftSource(path.join(SRC_DIR, filename), filename);
    }

    // Link AppIntents.framework to the main app — required so the system can
    // discover and invoke StopTimerIntent / ResetTimerIntent from the lock screen.
    // (_shared/ files like LiveTimerIntents.swift are already included in the main
    // app target by @bacons/apple-targets — no separate copy needed here.)
    try {
      xcodeProject.addFramework("AppIntents.framework", { target: targetKey });
    } catch (_) {
      // Already linked — ignore duplicate errors.
    }

    return c;
  });

  // ── 3. Widget build settings (finalized = runs after ALL other mods) ─────────
  // withFinalizedMod has the highest priority and runs after @bacons/apple-targets
  // writes the widget target. We use direct string replacement to avoid parser
  // incompatibilities between the standard 'xcode' package and '@bacons/xcode'.
  config = withFinalizedMod(config, [
    "ios",
    async (c) => {
      const pbxprojPath = require("path").join(
        c.modRequest.projectRoot,
        "ios",
        `${c.modRequest.projectName}.xcodeproj`,
        "project.pbxproj",
      );
      const fs = require("fs");
      if (!fs.existsSync(pbxprojPath)) return c;
      let content = fs.readFileSync(pbxprojPath, "utf8");
      // Replace the widget extension's "1,2" (iPhone + iPad) with "1" (iPhone only).
      // The main app is already set to 1 via supportsTablet:false in app.json.
      const patched = content.replace(
        /TARGETED_DEVICE_FAMILY = "1,2";/g,
        'TARGETED_DEVICE_FAMILY = "1";',
      );
      if (patched !== content) {
        fs.writeFileSync(pbxprojPath, patched);
        console.log("[withLiveTimerModule] Widget set to iPhone-only.");
      }
      return c;
    },
  ]);

  return config;
};

module.exports = withLiveTimerModule;
