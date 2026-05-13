/**
 * TimerContext — global rest-timer state shared between the Timer tab,
 * the active-workout mini-timer, and the iOS Live Activity (lock screen).
 *
 * Single source of truth:  all timer logic lives here so the timer tab and
 * the in-workout timer always show and control the same countdown.
 */

import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  getLiveActivityState,
  startLiveActivity,
  updateLiveActivity,
} from "./liveTimer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimerContextValue {
  /** Configured countdown duration (seconds). */
  selectedSeconds: number;
  /** Current remaining seconds (equals selectedSeconds when idle). */
  remaining: number;
  /** True while the countdown is ticking. */
  isRunning: boolean;
  /** Change the configured duration. No-op while running. */
  setSelectedSeconds: (s: number) => void;
  /** Start the countdown from selectedSeconds. */
  startTimer: () => void;
  /** Stop early (no alert sound). Cancels notification + live activity. */
  stopTimer: () => void;
}

const defaultValue: TimerContextValue = {
  selectedSeconds: 90,
  remaining: 90,
  isRunning: false,
  setSelectedSeconds: () => {},
  startTimer: () => {},
  stopTimer: () => {},
};

export const TimerContext = createContext<TimerContextValue>(defaultValue);

// ── Provider ──────────────────────────────────────────────────────────────────

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [selectedSeconds, _setSelected] = useState(90);
  const [remaining, setRemaining] = useState(90);
  const [isRunning, setIsRunning] = useState(false);

  // Refs to prevent stale closures in callbacks / AppState handlers
  const selectedRef = useRef(90);
  const isRunningRef = useRef(false);
  const endTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const handleDoneRef = useRef<(silent?: boolean) => void>(() => {});

  // expo-audio player — loaded once on mount
  // We import dynamically so a missing package doesn't crash on web/android.
  const playerRef = useRef<{
    seekTo: (secs: number) => void;
    play: () => void;
    remove: () => void;
  } | null>(null);

  // ── Keep refs in sync ────────────────────────────────────────────────────────

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // ── Audio + notification permission setup ────────────────────────────────────

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createAudioPlayer, setAudioModeAsync } = require("expo-audio");
        await setAudioModeAsync({ playsInSilentMode: true });
        if (!active) return;
        playerRef.current = createAudioPlayer(
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("../assets/audio/412017__skymary__cat-meow-short.wav"),
        );
      } catch {
        // expo-audio unavailable (e.g. web) — no in-app sound
      }
    })();

    Notifications.requestPermissionsAsync({
      ios: { allowSound: true, allowAlert: true, allowBadge: false },
    }).catch(() => {});

    return () => {
      active = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      playerRef.current?.remove();
    };
  }, []);

  // ── AppState: sync with Live Activity when returning from background ──────────

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        next === "active"
      ) {
        syncWithLiveActivity();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function scheduleNotification(seconds: number) {
    if (seconds <= 0) return;
    Notifications.scheduleNotificationAsync({
      content: {
        title: "Rest Timer",
        body: "Rest complete",
        sound: true,
        // interruptionLevel is iOS 15+ and breaks through Focus modes without
        // bypassing the mute switch (that requires a Critical Alerts entitlement)
        interruptionLevel: "timeSensitive" as "timeSensitive",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
      },
    }).catch(() => {});
  }

  function startInterval() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!endTimeRef.current) return;
      const diff = Math.ceil((endTimeRef.current - Date.now()) / 1000);
      if (diff <= 0) {
        handleDoneRef.current();
      } else {
        setRemaining(diff);
      }
    }, 500);
  }

  /**
   * Reads the Live Activity state and syncs the JS timer to it.
   * Called whenever the app returns to the foreground.
   */
  function syncWithLiveActivity() {
    getLiveActivityState().then((actState) => {
      if (actState && !actState.isRunning) {
        // ── Timer was stopped from the lock screen ─────────────────────────
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        endTimeRef.current = null;
        const total = actState.totalSeconds;
        selectedRef.current = total;
        _setSelected(total);
        setRemaining(total);
        setIsRunning(false);
        isRunningRef.current = false;
        // Cancel any pending notification (user already stopped intentionally)
        Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
        Notifications.dismissAllNotificationsAsync().catch(() => {});
      } else if (actState && actState.isRunning) {
        // ── Timer is (still) running — may have been reset from lock screen ──
        const diff = Math.ceil((actState.endTimeMs - Date.now()) / 1000);
        if (diff <= 0) {
          // Expired while we were backgrounded — notification already fired
          handleDoneRef.current(true);
        } else {
          endTimeRef.current = actState.endTimeMs;
          setRemaining(diff);
          setIsRunning(true);
          isRunningRef.current = true;
          // Reschedule notification in case end-time changed (e.g. after Reset)
          Notifications.cancelAllScheduledNotificationsAsync()
            .then(() => scheduleNotification(diff))
            .catch(() => {});
          if (!intervalRef.current) {
            startInterval();
          }
        }
      } else if (endTimeRef.current !== null) {
        // ── No live activity — fall back to our local end-time ref ────────────
        const diff = Math.ceil((endTimeRef.current - Date.now()) / 1000);
        if (diff <= 0) {
          handleDoneRef.current(true);
        } else {
          setRemaining(diff);
          if (!intervalRef.current) startInterval();
        }
      }
    });
  }

  // ── handleTimerDone ────────────────────────────────────────────────────────
  // `silent` = true when the OS notification already played (app was suspended
  //  when the timer expired) or the user stopped it manually.

  function handleTimerDone(silent = false) {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endTimeRef.current = null;

    const appIsActive = AppState.currentState === "active";

    if (appIsActive) {
      // Foreground: cancel notification (we'll play the in-app sound below)
      Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      Notifications.dismissAllNotificationsAsync().catch(() => {});
    }
    // Background: let the scheduled notification fire naturally — do NOT cancel

    // Update Live Activity to "Rest Complete" (keeps it alive for ~5 min so
    // the lock-screen Reset button remains functional)
    updateLiveActivity(Date.now(), selectedRef.current, false).catch(() => {});

    // Play in-app alert only when the app is in the foreground AND not already
    // handled by an OS notification (avoids double-alerting)
    if (!silent && appIsActive) {
      const player = playerRef.current;
      if (player) {
        player.seekTo(0);
        player.play();
      }
      // Triple haptic burst
      [0, 100, 250].forEach((delay) =>
        setTimeout(
          () =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(
              () => {},
            ),
          delay,
        ),
      );
    }

    setRemaining(selectedRef.current);
    setIsRunning(false);
    isRunningRef.current = false;
  }

  handleDoneRef.current = handleTimerDone;

  // ── Public API ────────────────────────────────────────────────────────────────

  function setSelectedSeconds(s: number) {
    selectedRef.current = s;
    _setSelected(s);
    if (!isRunningRef.current) {
      setRemaining(s);
    }
  }

  function startTimer() {
    const total = selectedRef.current;
    if (total <= 0) return;
    const end = Date.now() + total * 1000;
    endTimeRef.current = end;
    setRemaining(total);
    setIsRunning(true);
    isRunningRef.current = true;

    // Start / update Live Activity (handles existing stale activities in bridge)
    startLiveActivity(end, total).catch(console.error);

    // Schedule local notification as a fallback for when the app is suspended
    Notifications.cancelAllScheduledNotificationsAsync()
      .then(() => scheduleNotification(total))
      .catch(() => {});

    startInterval();
  }

  function stopTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endTimeRef.current = null;
    Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    updateLiveActivity(Date.now(), selectedRef.current, false).catch(() => {});
    setRemaining(selectedRef.current);
    setIsRunning(false);
    isRunningRef.current = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <TimerContext.Provider
      value={{
        selectedSeconds,
        remaining,
        isRunning,
        setSelectedSeconds,
        startTimer,
        stopTimer,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  return useContext(TimerContext);
}
