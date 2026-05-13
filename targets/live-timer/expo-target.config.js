/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "LiveTimer",
  bundleIdentifier: ".livetimer",
  deploymentTarget: "16.2",
  appleTeamId: "UQ6CB8CM9T",
  teamId: "UQ6CB8CM9T",
  // WidgetKit, ActivityKit, and AppIntents are system frameworks.
  frameworks: ["WidgetKit", "ActivityKit", "AppIntents"],
};
