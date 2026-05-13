import Colors from "@/constants/Colors";
import { useTimer } from "@/src/TimerContext";
import { useColorScheme } from "@/components/useColorScheme";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

// Animated SVG circle for the countdown ring
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Ring geometry — kept at module level so the animation hook can reference them
const RING_SIZE = 200;
const RING_BORDER = 10;
const RADIUS = (RING_SIZE - RING_BORDER) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ── Wheel geometry ─────────────────────────────────────────────────────────────
const ITEM_HEIGHT = 48; // height of each number row
const VISIBLE_ITEMS = 5; // must be odd so selected item is centred
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2); // 2 ghost rows top + bottom

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "1m", seconds: 60 },
  { label: "1:30", seconds: 90 },
  { label: "2m", seconds: 120 },
  { label: "2:30", seconds: 150 },
  { label: "3m", seconds: 180 },
];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatMMSS(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ── NumberWheel ────────────────────────────────────────────────────────────────
// Fully self-contained: it owns its scroll position via a ref so parent
// re-renders never fight an in-progress touch.
interface NumberWheelProps {
  min: number;
  max: number;
  step: number;
  value: number; // current value; wheel centres on this when idle
  onChange: (n: number) => void;
  label: string;
  accent: string;
  theme: (typeof Colors)["light"];
}

function NumberWheel({
  min,
  max,
  step,
  value,
  onChange,
  label,
  accent,
  theme,
}: NumberWheelProps) {
  // ---------------------------------------------------------------------------
  // Refs – all scroll state lives here, never in React state, so touches are
  // never interrupted by a re-render triggered by the parent.
  // ---------------------------------------------------------------------------
  const scrollRef = useRef<ScrollView>(null);
  /** Build the initial value array synchronously so the first render has items */
  const initialArr: number[] = [];
  for (let v = min; v <= max; v += step) initialArr.push(v);
  /** The full ordered value array – rebuilt only when min/max/step changes */
  const allValuesRef = useRef<number[]>(initialArr);
  const initialIdx = closestIdx(initialArr, value);
  /** Index currently snapped to the centre row */
  const currentIdxRef = useRef(initialIdx);
  /** Prevents duplicate commit from both drag-end and momentum-end events */
  const hasMomentumRef = useRef(false);
  /** Guards against a programmatic scroll being treated as a user scroll */
  const isProgrammaticRef = useRef(false);
  /** Last index that fired a haptic – avoids double-firing */
  const lastHapticIdxRef = useRef(initialIdx);

  // ---------------------------------------------------------------------------
  // Visual highlight – initialised to the correct index so first render shows
  // the right item highlighted (important when value = 0).
  // ---------------------------------------------------------------------------
  const [highlightIdx, setHighlightIdx] = useState(initialIdx);

  // ---------------------------------------------------------------------------
  // Build / rebuild the full value list (runs once on mount and if range changes)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const arr: number[] = [];
    for (let v = min; v <= max; v += step) arr.push(v);
    allValuesRef.current = arr;
    const startIdx = closestIdx(arr, value);
    currentIdxRef.current = startIdx;
    lastHapticIdxRef.current = startIdx;
    setHighlightIdx(startIdx);
    isProgrammaticRef.current = true;
    // Use a tiny delay so the ScrollView has rendered its children first
    const t1 = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: startIdx * ITEM_HEIGHT,
        animated: false,
      });
    }, 0);
    const t2 = setTimeout(() => {
      isProgrammaticRef.current = false;
    }, 150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, step]);

  // ---------------------------------------------------------------------------
  // Sync when parent drives a value change (preset, text input).
  // Skip if the list hasn't been built yet (handled above).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const arr = allValuesRef.current;
    if (!arr.length) return;
    const idx = closestIdx(arr, value);
    if (idx === currentIdxRef.current) return; // already there — nothing to do
    currentIdxRef.current = idx;
    lastHapticIdxRef.current = idx;
    setHighlightIdx(idx);
    // Only scroll programmatically if we're not mid-touch
    if (!isProgrammaticRef.current) {
      isProgrammaticRef.current = true;
      scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
      const t = setTimeout(() => {
        isProgrammaticRef.current = false;
      }, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ---------------------------------------------------------------------------
  // Scroll handlers
  // ---------------------------------------------------------------------------
  function handleScrollBeginDrag() {
    // User has intentionally started a drag — always allow it, regardless of
    // any in-flight programmatic scroll guard.
    isProgrammaticRef.current = false;
    hasMomentumRef.current = false;
    Keyboard.dismiss();
  }

  function handleMomentumScrollBegin() {
    hasMomentumRef.current = true;
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isProgrammaticRef.current) return;
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = clamp(idx, 0, allValuesRef.current.length - 1);
    if (clamped !== lastHapticIdxRef.current) {
      lastHapticIdxRef.current = clamped;
      setHighlightIdx(clamped);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }

  function commitFromY(y: number) {
    if (isProgrammaticRef.current) return;
    const arr = allValuesRef.current;
    const idx = clamp(Math.round(y / ITEM_HEIGHT), 0, arr.length - 1);
    currentIdxRef.current = idx;
    lastHapticIdxRef.current = idx;
    setHighlightIdx(idx);
    // snapToInterval already snapped the scroll position; just fire the callback
    const newVal = arr[idx];
    if (newVal !== value) onChange(newVal);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  function handleScrollEndDrag(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!hasMomentumRef.current) {
      commitFromY(e.nativeEvent.contentOffset.y);
    }
  }

  function handleMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    commitFromY(e.nativeEvent.contentOffset.y);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const allValues = allValuesRef.current;

  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text
        style={{
          color: theme.textMuted,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.8,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <View style={{ height: WHEEL_HEIGHT, width: 72, overflow: "hidden" }}>
        {/* Centre-row highlight band */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: PADDING_ITEMS * ITEM_HEIGHT,
            left: 0,
            right: 0,
            height: ITEM_HEIGHT,
            backgroundColor: accent + "22",
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: accent + "66",
            zIndex: 2,
          }}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onScrollBeginDrag={handleScrollBeginDrag}
          onMomentumScrollBegin={handleMomentumScrollBegin}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          contentContainerStyle={{
            paddingTop: PADDING_ITEMS * ITEM_HEIGHT,
            paddingBottom: PADDING_ITEMS * ITEM_HEIGHT,
          }}
        >
          {allValues.map((n, i) => {
            const isSelected = i === highlightIdx;
            return (
              <View
                key={n}
                style={{
                  height: ITEM_HEIGHT,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: isSelected ? 26 : 18,
                    fontWeight: isSelected ? "700" : "400",
                    color: isSelected ? accent : theme.textMuted,
                    fontVariant: ["tabular-nums"] as any,
                    opacity: isSelected ? 1 : 0.45,
                  }}
                >
                  {String(n).padStart(2, "0")}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// Helper used by the component above — not a method so there's no stale closure
function closestIdx(arr: number[], val: number): number {
  let best = 0;
  let bestDiff = Infinity;
  arr.forEach((v, i) => {
    const d = Math.abs(v - val);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  });
  return best;
}

// ──────────────────────────────────────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────────────────────────────────────

type ActiveWheel = "mins" | "secs" | null;

export default function TimerScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const styles = makeStyles(theme);

  // ── All timer state/actions come from the global context ───────────────────
  const {
    selectedSeconds,
    remaining,
    isRunning,
    setSelectedSeconds,
    startTimer,
    stopTimer,
  } = useTimer();

  // Derived
  const selectedMins = Math.floor(selectedSeconds / 60);
  const selectedSecs = selectedSeconds % 60;

  // Which wheel is open (null = ring/timer shown)
  const [activeWheel, setActiveWheel] = useState<ActiveWheel>(null);

  // Text input values — kept in sync with context selectedSeconds
  const [customMins, setCustomMins] = useState(String(selectedMins));
  const [customSecs, setCustomSecs] = useState(String(selectedSecs));

  useEffect(() => {
    setCustomMins(String(Math.floor(selectedSeconds / 60)));
    setCustomSecs(String(selectedSeconds % 60));
  }, [selectedSeconds]);

  // ── SVG ring animation ──────────────────────────────────────────────────────
  // sweepAnim: 0 = full ring  /  1 = empty ring (timer done)
  const sweepAnim = useSharedValue(0);

  useEffect(() => {
    if (!isRunning) {
      sweepAnim.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
    } else if (isRunning && selectedSeconds > 0) {
      const elapsed = Math.max(0, Math.min(1, 1 - remaining / selectedSeconds));
      sweepAnim.value = withTiming(elapsed, {
        duration: 600,
        easing: Easing.linear,
      });
    }
  }, [remaining, isRunning, selectedSeconds]);

  const animatedArcProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * sweepAnim.value,
  }));

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function pickPreset(seconds: number) {
    if (isRunning) stopTimer();
    setSelectedSeconds(seconds);
    setActiveWheel(null);
  }

  function applyMins(mins: number) {
    const clamped = clamp(mins, 0, 5);
    setSelectedSeconds(clamped * 60 + selectedSecs);
  }

  function applySecs(secs: number) {
    const clamped = clamp(secs, 0, 59);
    setSelectedSeconds(selectedMins * 60 + clamped);
  }

  function handleMinsTextChange(t: string) {
    const clean = t.replace(/\D/g, "").slice(0, 2);
    setCustomMins(clean);
    const n = parseInt(clean, 10);
    if (!isNaN(n)) applyMins(n);
  }

  function handleSecsTextChange(t: string) {
    const stripped = t.replace(/\D/g, "");
    const clean = stripped.length > 1 ? stripped.replace(/^0+/, "") : stripped;
    const capped = clean.slice(0, 2);
    setCustomSecs(capped);
    const n = parseInt(capped, 10);
    if (!isNaN(n)) applySecs(n);
  }

  // ── Ring color / state helpers ───────────────────────────────────────────────
  const isIdle = !isRunning;
  const showWheel = isIdle && activeWheel !== null;

  const ringColor = isRunning ? Colors.accent : theme.border;
  const timeColor = isRunning ? theme.text : theme.textSecondary;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Presets */}
      <View style={styles.presetRow}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.seconds}
            style={[
              styles.presetBtn,
              {
                backgroundColor:
                  selectedSeconds === p.seconds && isIdle
                    ? Colors.accent
                    : theme.card,
                borderColor:
                  selectedSeconds === p.seconds && isIdle
                    ? Colors.accent
                    : theme.border,
              },
            ]}
            onPress={() => pickPreset(p.seconds)}
            disabled={isRunning}
          >
            <Text
              style={[
                styles.presetText,
                {
                  color:
                    selectedSeconds === p.seconds && isIdle
                      ? "#fff"
                      : theme.textSecondary,
                },
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* MM:SS inputs — tap to open wheel, also typeable (always visible) */}
      <View
        style={[
          styles.inputRow,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.inputGroup}>
          <View
            style={[
              styles.inputBox,
              {
                backgroundColor: theme.inputBg,
                borderColor:
                  activeWheel === "mins" ? Colors.accent : theme.border,
                borderWidth: activeWheel === "mins" ? 2 : 1,
              },
            ]}
          >
            <TextInput
              style={[styles.inputText, { color: theme.text }]}
              value={customMins}
              onChangeText={handleMinsTextChange}
              keyboardType="number-pad"
              placeholder="00"
              placeholderTextColor={theme.textMuted}
              maxLength={2}
              onFocus={() => setActiveWheel("mins")}
              selectTextOnFocus
            />
          </View>
          <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
            min
          </Text>
        </View>

        <Text style={[styles.inputSep, { color: theme.textSecondary }]}>:</Text>

        <View style={styles.inputGroup}>
          <View
            style={[
              styles.inputBox,
              {
                backgroundColor: theme.inputBg,
                borderColor:
                  activeWheel === "secs" ? Colors.accent : theme.border,
                borderWidth: activeWheel === "secs" ? 2 : 1,
              },
            ]}
          >
            <TextInput
              style={[styles.inputText, { color: theme.text }]}
              value={customSecs}
              onChangeText={handleSecsTextChange}
              keyboardType="number-pad"
              placeholder="00"
              placeholderTextColor={theme.textMuted}
              maxLength={2}
              onFocus={() => setActiveWheel("secs")}
              selectTextOnFocus
            />
          </View>
          <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
            sec
          </Text>
        </View>
      </View>

      {/* Number wheel (replaces ring when a field is focused) OR countdown ring */}
      {showWheel ? (
        <>
          <Pressable
            style={styles.dismissOverlay}
            onPress={() => {
              Keyboard.dismiss();
              setActiveWheel(null);
            }}
          />
          <View style={styles.wheelContainer}>
            <View
              style={[
                styles.wheelCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <View style={styles.wheelRow}>
                <NumberWheel
                  min={0}
                  max={5}
                  step={1}
                  value={selectedMins}
                  onChange={applyMins}
                  label="MINUTES"
                  accent={Colors.accent}
                  theme={theme}
                />
                <Text
                  style={[styles.wheelColon, { color: theme.textSecondary }]}
                >
                  :
                </Text>
                <NumberWheel
                  min={0}
                  max={55}
                  step={5}
                  value={selectedSecs}
                  onChange={applySecs}
                  label="SECONDS"
                  accent={Colors.accent}
                  theme={theme}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.wheelDoneBtn,
                  { backgroundColor: Colors.accent },
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setActiveWheel(null);
                }}
              >
                <Text style={styles.wheelDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <TouchableOpacity
          style={styles.ringWrapper}
          onPress={() => {
            if (selectedSeconds === 0) return;
            if (isRunning) {
              stopTimer();
            } else {
              startTimer();
            }
          }}
          activeOpacity={selectedSeconds === 0 ? 1 : 0.7}
        >
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            style={{ position: "absolute" }}
          >
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={theme.border}
              strokeWidth={RING_BORDER}
              fill="none"
            />
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={ringColor}
              strokeWidth={RING_BORDER}
              fill="none"
              strokeDasharray={CIRCUMFERENCE}
              strokeLinecap="round"
              transform={`rotate(-90, ${RING_SIZE / 2}, ${RING_SIZE / 2})`}
              animatedProps={animatedArcProps}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={[styles.timeDisplay, { color: timeColor }]}>
              {formatMMSS(remaining)}
            </Text>
            <Text style={[styles.timeLabel, { color: theme.textMuted }]}>
              {isRunning ? "tap to stop" : "tap to start"}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {isIdle && (
          <TouchableOpacity
            style={[
              styles.mainBtn,
              {
                backgroundColor:
                  selectedSeconds === 0 ? theme.card : Colors.accent,
                borderWidth: selectedSeconds === 0 ? 1 : 0,
                borderColor: theme.border,
              },
            ]}
            onPress={startTimer}
            disabled={selectedSeconds === 0}
          >
            <Text
              style={[
                styles.mainBtnText,
                { color: selectedSeconds === 0 ? theme.textMuted : "#fff" },
              ]}
            >
              Start Rest
            </Text>
          </TouchableOpacity>
        )}

        {isRunning && (
          <TouchableOpacity
            style={[
              styles.mainBtn,
              {
                backgroundColor: theme.card,
                borderWidth: 1.5,
                borderColor: theme.border,
              },
            ]}
            onPress={() => {
              stopTimer();
              setActiveWheel(null);
            }}
          >
            <Text style={[styles.mainBtnText, { color: theme.textSecondary }]}>
              Done Early
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────────

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      paddingTop: 20,
      paddingHorizontal: 20,
    },
    presetRow: {
      flexDirection: "row",
      gap: 6,
      marginBottom: 10,
      flexWrap: "wrap",
      justifyContent: "center",
    },
    presetBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
    },
    presetText: { fontSize: 13, fontWeight: "600" },
    ringWrapper: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 28,
    },
    ringCenter: { alignItems: "center" },
    timeDisplay: {
      fontSize: 48,
      fontWeight: "700",
      letterSpacing: -2,
      fontVariant: ["tabular-nums"] as any,
    },
    timeLabel: { fontSize: 13, marginTop: 4 },
    controls: { width: "100%", gap: 10 },
    mainBtn: {
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
    },
    mainBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
    // MM:SS input row
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 20,
      marginBottom: 14,
      width: "100%",
    },
    inputGroup: { alignItems: "center", gap: 3 },
    inputBox: {
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 3,
      minWidth: 60,
      alignItems: "center",
    },
    inputText: {
      fontSize: 24,
      fontWeight: "700",
      textAlign: "center",
      fontVariant: ["tabular-nums"] as any,
      minWidth: 52,
    },
    inputLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
    inputSep: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
    // Wheel
    dismissOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
    wheelContainer: { width: "100%", marginBottom: 24, zIndex: 2 },
    wheelCard: {
      borderRadius: 18,
      borderWidth: 1,
      paddingTop: 12,
      paddingBottom: 12,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    wheelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
    },
    wheelColon: {
      fontSize: 28,
      fontWeight: "700",
      marginHorizontal: 6,
      marginTop: 20,
    },
    wheelDoneBtn: {
      marginTop: 12,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 36,
    },
    wheelDoneBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  });
}
