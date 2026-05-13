/**
 * JS interface for the LiveTimerBridge native module.
 *
 * startLiveActivity()  — starts or updates the Live Activity with a new end time.
 * updateLiveActivity() — updates state without restarting (e.g. mark as stopped).
 * getLiveActivityState() — read current activity state (for syncing UI on foreground).
 * endLiveActivity()    — ends and dismisses the activity immediately.
 */

import { NativeModules, Platform } from "react-native";

const bridge = Platform.OS === "ios" ? NativeModules.LiveTimerBridge : null;

/**
 * @param endTimeMs   — Unix timestamp in milliseconds when the timer ends.
 * @param totalSeconds — Original duration in seconds (used by lock-screen reset).
 */
export async function startLiveActivity(
  endTimeMs: number,
  totalSeconds: number,
): Promise<void> {
  if (!bridge) return;
  await bridge.startActivity(endTimeMs, totalSeconds);
}

/**
 * Updates the activity state without restarting. Use this to mark the timer
 * as stopped/idle so the widget persists showing the last duration.
 */
export async function updateLiveActivity(
  endTimeMs: number,
  totalSeconds: number,
  isRunning: boolean,
): Promise<void> {
  if (!bridge) return;
  try {
    await bridge.updateActivity(endTimeMs, totalSeconds, isRunning);
  } catch {}
}

export interface LiveActivityState {
  isRunning: boolean;
  endTimeMs: number;
  totalSeconds: number;
}

/**
 * Returns the current Live Activity state, or null if none is active.
 * Used to sync app UI after the user interacts with the widget buttons.
 */
export async function getLiveActivityState(): Promise<LiveActivityState | null> {
  if (!bridge) return null;
  try {
    const result = await bridge.getActivityState();
    return result ?? null;
  } catch {
    return null;
  }
}

export async function endLiveActivity(): Promise<void> {
  if (!bridge) return;
  try {
    await bridge.endActivity();
  } catch {}
}
