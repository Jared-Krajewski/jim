/**
 * Shared active-workout logging component.
 * Used by both /log/[id] (from template) and /log/adhoc (ad-hoc).
 */
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import { MUSCLE_GROUPS } from "@/constants/MuscleGroups";
import {
  Exercise,
  SessionSet,
  addSet,
  completeSession,
  createExercise,
  createSession,
  deleteSession,
  deleteSet,
  getExercises,
  getSession,
  getSessionSets,
  getTemplate,
  getTemplateExercises,
  updateSet,
} from "@/src/db/database";
import { useTimer } from "@/src/TimerContext";
import { useUnit } from "@/src/UnitContext";
import { useActiveWorkout } from "@/src/WorkoutContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated2, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type ExerciseGroup = {
  exercise: { id: number; name: string; muscle_group: string };
  sets: SessionSet[];
};

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** Workouts longer than this are auto-completed to avoid stale sessions. */
const MAX_WORKOUT_SECONDS = 2.5 * 60 * 60; // 9 000 seconds

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function groupSets(sets: SessionSet[]): ExerciseGroup[] {
  const map = new Map<number, ExerciseGroup>();
  for (const s of sets) {
    if (!map.has(s.exercise_id)) {
      map.set(s.exercise_id, {
        exercise: {
          id: s.exercise_id,
          name: s.exercise_name,
          muscle_group: s.muscle_group,
        },
        sets: [],
      });
    }
    map.get(s.exercise_id)!.sets.push(s);
  }
  return Array.from(map.values());
}

function applyOrder(groups: ExerciseGroup[], order: number[]): ExerciseGroup[] {
  if (order.length === 0) return groups;
  const map = new Map(groups.map((g) => [g.exercise.id, g]));
  const ordered: ExerciseGroup[] = [];
  for (const id of order) {
    const g = map.get(id);
    if (g) ordered.push(g);
    map.delete(id);
  }
  for (const g of map.values()) ordered.push(g);
  return ordered;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

// ──────────────────────────────────────────────────────────────────────────────
// Mini rest-timer (shared state with the Timer tab)
// ──────────────────────────────────────────────────────────────────────────────

const AnimatedCircle = Animated2.createAnimatedComponent(Circle);

const MINI_RING = 80;
const MINI_BORDER = 5;
const MINI_RADIUS = (MINI_RING - MINI_BORDER) / 2;
const MINI_CIRC = 2 * Math.PI * MINI_RADIUS;

const MINI_PRESETS = [
  { label: "1m", seconds: 60 },
  { label: "1:30", seconds: 90 },
  { label: "2m", seconds: 120 },
  { label: "2:30", seconds: 150 },
  { label: "3m", seconds: 180 },
];

function formatMMSS(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function WorkoutTimer({ theme }: { theme: (typeof Colors)["light"] }) {
  const {
    selectedSeconds,
    remaining,
    isRunning,
    setSelectedSeconds,
    startTimer,
    stopTimer,
  } = useTimer();

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
    strokeDashoffset: MINI_CIRC * sweepAnim.value,
  }));

  function handleRingPress() {
    if (isRunning) {
      stopTimer();
    } else if (selectedSeconds > 0) {
      startTimer();
    }
  }

  function pickPreset(secs: number) {
    if (isRunning) stopTimer();
    setSelectedSeconds(secs);
  }

  const ringColor = isRunning ? Colors.accent : theme.border;
  const timeColor = isRunning ? theme.text : theme.textSecondary;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.border,
      }}
    >
      {/* Presets */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: theme.textMuted,
            letterSpacing: 0.7,
            marginBottom: 7,
          }}
        >
          REST TIMER
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {MINI_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.seconds}
              onPress={() => pickPreset(p.seconds)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 16,
                borderWidth: 1.5,
                backgroundColor:
                  selectedSeconds === p.seconds && !isRunning
                    ? Colors.accent
                    : theme.card,
                borderColor:
                  selectedSeconds === p.seconds && !isRunning
                    ? Colors.accent
                    : theme.border,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color:
                    selectedSeconds === p.seconds && !isRunning
                      ? "#fff"
                      : theme.textSecondary,
                }}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {/* Compact ring */}
      <TouchableOpacity
        onPress={handleRingPress}
        activeOpacity={selectedSeconds === 0 ? 1 : 0.7}
        style={{
          width: MINI_RING,
          height: MINI_RING,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg
          width={MINI_RING}
          height={MINI_RING}
          style={{ position: "absolute" }}
        >
          <Circle
            cx={MINI_RING / 2}
            cy={MINI_RING / 2}
            r={MINI_RADIUS}
            stroke={theme.border}
            strokeWidth={MINI_BORDER}
            fill="none"
          />
          <AnimatedCircle
            cx={MINI_RING / 2}
            cy={MINI_RING / 2}
            r={MINI_RADIUS}
            stroke={ringColor}
            strokeWidth={MINI_BORDER}
            fill="none"
            strokeDasharray={MINI_CIRC}
            strokeLinecap="round"
            transform={`rotate(-90, ${MINI_RING / 2}, ${MINI_RING / 2})`}
            animatedProps={animatedArcProps}
          />
        </Svg>
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: timeColor,
              fontVariant: ["tabular-nums"] as never,
            }}
          >
            {formatMMSS(remaining)}
          </Text>
          <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 1 }}>
            {isRunning ? "tap to stop" : "tap to start"}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

type Props = {
  templateId?: number; // if provided, start a new session from this template
  resumeSessionId?: number; // if provided, resume an existing in-progress session
};

export default function ActiveWorkoutScreen({
  templateId,
  resumeSessionId,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const styles = makeStyles(theme);
  const router = useRouter();
  const { unit } = useUnit();
  const {
    setActiveWorkout,
    finishedExerciseIds,
    setFinishedExerciseIds,
    exerciseOrder,
    setExerciseOrder,
  } = useActiveWorkout();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add-exercise picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");

  // Create-new-exercise form — rendered inside the picker modal (avoids iOS modal stacking)
  const [pickerView, setPickerView] = useState<"list" | "create">("list");
  const [newExName, setNewExName] = useState("");
  const [newExMuscle, setNewExMuscle] = useState<string>(MUSCLE_GROUPS[0]);
  const [newExReps, setNewExReps] = useState("10");
  const [newExWeight, setNewExWeight] = useState("");
  const [newExSaving, setNewExSaving] = useState(false);
  const [pickerMuscleFilter, setPickerMuscleFilter] = useState<string | null>(
    null,
  );

  // Drag-to-reorder state
  const groupsRef = useRef<ExerciseGroup[]>([]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // Mirror finishedExerciseIds into a ref so the PanResponder closure can read it
  const finishedExerciseIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    finishedExerciseIdsRef.current = finishedExerciseIds;
  }, [finishedExerciseIds]);

  const draggingIdxRef = useRef(-1);
  const [draggingIdx, setDraggingIdx] = useState(-1);
  const hoverIdxRef = useRef(-1);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const dragYAnim = useRef(new Animated.Value(0)).current;
  const dragStartAbsY = useRef(0);
  const itemRefs = useRef<(View | null)[]>([]);
  const itemAbsoluteY = useRef<{ y: number; height: number }[]>([]);
  const isDraggingRef = useRef(false);

  function startDrag(idx: number, pageY: number) {
    // Measure only active (non-done) group items
    itemAbsoluteY.current = [];
    const doneIds = finishedExerciseIdsRef.current;
    let ai = 0;
    groupsRef.current.forEach((g) => {
      if (!doneIds.has(g.exercise.id)) {
        const i = ai++;
        (itemRefs.current[i] as View | null)?.measure?.(
          (_fx, _fy, _w, h, _px, py) => {
            itemAbsoluteY.current[i] = { y: py, height: h };
          },
        );
      }
    });
    dragStartAbsY.current = pageY;
    draggingIdxRef.current = idx;
    hoverIdxRef.current = idx;
    isDraggingRef.current = true;
    dragYAnim.setValue(0);
    setDraggingIdx(idx);
    setHoverIdx(idx);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: () => isDraggingRef.current,
      onPanResponderMove: (e) => {
        if (!isDraggingRef.current) return;
        const dy = e.nativeEvent.pageY - dragStartAbsY.current;
        dragYAnim.setValue(dy);
        const draggedLayout = itemAbsoluteY.current[draggingIdxRef.current];
        if (!draggedLayout) return;
        const centerY = draggedLayout.y + draggedLayout.height / 2 + dy;
        let closestIdx = draggingIdxRef.current;
        let closestDist = Infinity;
        itemAbsoluteY.current.forEach((lay, i) => {
          if (!lay) return;
          const dist = Math.abs(lay.y + lay.height / 2 - centerY);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        });
        if (closestIdx !== hoverIdxRef.current) {
          hoverIdxRef.current = closestIdx;
          setHoverIdx(closestIdx);
        }
      },
      onPanResponderRelease: () => {
        if (!isDraggingRef.current) return;
        const from = draggingIdxRef.current;
        const to = hoverIdxRef.current;
        if (from >= 0 && to >= 0 && from !== to) {
          // Reorder only the active (non-done) groups, then recombine
          const doneIds = finishedExerciseIdsRef.current;
          const activeOnly = groupsRef.current.filter(
            (g) => !doneIds.has(g.exercise.id),
          );
          const completedOnly = groupsRef.current.filter((g) =>
            doneIds.has(g.exercise.id),
          );
          const newActive = [...activeOnly];
          const [item] = newActive.splice(from, 1);
          newActive.splice(to, 0, item);
          const newGroups = [...newActive, ...completedOnly];
          setGroups(newGroups);
          setExerciseOrder(newGroups.map((g) => g.exercise.id));
        }
        dragYAnim.setValue(0);
        isDraggingRef.current = false;
        draggingIdxRef.current = -1;
        hoverIdxRef.current = -1;
        setDraggingIdx(-1);
        setHoverIdx(-1);
      },
      onPanResponderTerminate: () => {
        dragYAnim.setValue(0);
        isDraggingRef.current = false;
        draggingIdxRef.current = -1;
        hoverIdxRef.current = -1;
        setDraggingIdx(-1);
        setHoverIdx(-1);
      },
    }),
  ).current;

  // Initialize session on mount
  useEffect(() => {
    if (resumeSessionId) {
      resumeSession(resumeSessionId);
    } else {
      initSession();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-end workout after 2.5 hours to prevent forgotten sessions
  useEffect(() => {
    if (elapsedSec >= MAX_WORKOUT_SECONDS && sessionId) {
      (async () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        await completeSession(sessionId);
        setActiveWorkout(null);
        router.replace("/(tabs)/workouts");
      })();
    }
  }, [elapsedSec, sessionId]);

  // ── Resume an existing in-progress session ─────────────────────────────────

  async function resumeSession(sid: number) {
    const session = await getSession(sid);
    if (!session) {
      // Session not found (was deleted?) — fall back to a fresh workout.
      initSession();
      return;
    }
    setSessionId(sid);
    setSessionName(session.name);
    setActiveWorkout({ sessionId: sid, sessionName: session.name });
    await loadSets(sid);
    // Restore elapsed time from when the session started.
    const elapsedMs = Date.now() - session.started_at * 1000;
    startRef.current = Date.now() - Math.max(0, elapsedMs);
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
  }

  async function initSession() {
    let name = "Quick Workout";
    if (templateId) {
      const tmpl = await getTemplate(templateId);
      name = tmpl?.name ?? "Workout";
    }
    const id = await createSession(name, templateId ?? null, todayISO());
    setSessionId(id);
    setSessionName(name);
    setActiveWorkout({ sessionId: id, sessionName: name });

    // Pre-populate from template — default to 1 set per exercise.
    if (templateId) {
      const templateExs = await getTemplateExercises(templateId);
      // Set exercise order to match template sort order
      setExerciseOrder(templateExs.map((te) => te.exercise_id));
      for (const te of templateExs) {
        await addSet(
          id,
          te.exercise_id,
          1,
          te.default_reps,
          te.default_weight ?? 0,
        );
      }
    }
    await loadSets(id);

    // Start timer
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
  }

  async function loadSets(sid?: number) {
    const id = sid ?? sessionId;
    if (!id) return;
    const sets = await getSessionSets(id);
    const rawGroups = groupSets(sets);
    setGroups(applyOrder(rawGroups, exerciseOrder));
  }

  // ── Set operations ──────────────────────────────────────────────────────────

  async function handleAddSet(exerciseId: number) {
    if (!sessionId) return;
    const group = groups.find((g) => g.exercise.id === exerciseId);
    const setNumber = (group?.sets.length ?? 0) + 1;
    // Copy last set's weight/reps as default
    const last = group?.sets[group.sets.length - 1];
    await addSet(
      sessionId,
      exerciseId,
      setNumber,
      last?.reps ?? 10,
      last?.weight ?? 0,
    );
    await loadSets();
  }

  async function handleUpdateSet(id: number, reps: number, weight: number) {
    await updateSet(id, reps, weight);
    await loadSets();
  }

  async function handleDeleteSet(id: number) {
    await deleteSet(id);
    await loadSets();
  }

  // ── Add exercise to session ─────────────────────────────────────────────────

  async function openPicker() {
    const exs = await getExercises();
    setAllExercises(exs);
    setPickerSearch("");
    setPickerMuscleFilter(null);
    setPickerVisible(true);
  }

  async function addExerciseThenSet(exercise: Exercise) {
    if (!sessionId) return;
    await addSet(
      sessionId,
      exercise.id,
      1,
      exercise.default_reps ?? 10,
      exercise.default_weight ?? 0,
    );
    setPickerVisible(false);
    await loadSets();
  }

  async function handleCreateNewExercise() {
    const name = newExName.trim();
    if (!name) {
      Alert.alert("Name required", "Please give this exercise a name.");
      return;
    }
    setNewExSaving(true);
    try {
      const exId = await createExercise(
        name,
        newExMuscle,
        "",
        parseFloat(newExWeight) || 0,
        unit,
        parseInt(newExReps, 10) || 10,
      );
      if (sessionId) {
        await addSet(
          sessionId,
          exId,
          1,
          parseInt(newExReps, 10) || 10,
          parseFloat(newExWeight) || 0,
        );
      }
      setPickerView("list");
      setPickerVisible(false);
      await loadSets();
      // Refresh the all-exercises list for next time picker opens
      const exs = await getExercises();
      setAllExercises(exs);
    } catch (e) {
      console.error(e);
    } finally {
      setNewExSaving(false);
    }
  }

  // ── Finish ──────────────────────────────────────────────────────────────────

  function handleFinish() {
    const total = groups.reduce((acc, g) => acc + g.sets.length, 0);
    Alert.alert(
      "Finish Workout?",
      `You logged ${total} set${total !== 1 ? "s" : ""} across ${groups.length} exercise${groups.length !== 1 ? "s" : ""}.`,
      [
        { text: "Keep Going", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            if (sessionId) {
              await deleteSession(sessionId);
            }
            if (timerRef.current) clearInterval(timerRef.current);
            setActiveWorkout(null);
            router.replace("/(tabs)/workouts");
          },
        },
        {
          text: "Finish",
          onPress: async () => {
            if (sessionId) await completeSession(sessionId);
            if (timerRef.current) clearInterval(timerRef.current);
            setActiveWorkout(null);
            router.replace("/(tabs)/workouts");
          },
        },
      ],
    );
  }

  function handleMinimize() {
    // Go back without discarding — session stays alive in the database.
    // The In Progress banner on the home screen lets the user re-enter.
    router.back();
  }

  // ── Move exercises to top/bottom of list ───────────────────────────────────────

  function moveToTop(idx: number) {
    const doneIds = finishedExerciseIds;
    const active = groups.filter((g) => !doneIds.has(g.exercise.id));
    const done = groups.filter((g) => doneIds.has(g.exercise.id));
    if (idx === 0) return;
    const newActive = [...active];
    const [item] = newActive.splice(idx, 1);
    newActive.unshift(item);
    const newGroups = [...newActive, ...done];
    setGroups(newGroups);
    setExerciseOrder(newGroups.map((g) => g.exercise.id));
  }

  function moveToBottom(idx: number) {
    const doneIds = finishedExerciseIds;
    const active = groups.filter((g) => !doneIds.has(g.exercise.id));
    const done = groups.filter((g) => doneIds.has(g.exercise.id));
    if (idx === active.length - 1) return;
    const newActive = [...active];
    const [item] = newActive.splice(idx, 1);
    newActive.push(item);
    const newGroups = [...newActive, ...done];
    setGroups(newGroups);
    setExerciseOrder(newGroups.map((g) => g.exercise.id));
  }

  // ── Finish / unfinish individual exercises ──────────────────────────────────

  function finishExercise(id: number) {
    setFinishedExerciseIds((prev) => new Set([...prev, id]));
  }

  function unfinishExercise(id: number) {
    setFinishedExerciseIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // ── Format timer ────────────────────────────────────────────────────────────

  function formatTime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  // ── Filtered picker ─────────────────────────────────────────────────────────

  const filteredPicker = allExercises.filter((e) => {
    const matchSearch = e.name
      .toLowerCase()
      .includes(pickerSearch.toLowerCase());
    const matchMuscle =
      !pickerMuscleFilter || e.muscle_group === pickerMuscleFilter;
    return matchSearch && matchMuscle;
  });

  const activeGroups = groups.filter(
    (g) => !finishedExerciseIds.has(g.exercise.id),
  );
  const completedGroups = groups.filter((g) =>
    finishedExerciseIds.has(g.exercise.id),
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity onPress={handleMinimize} style={styles.headerBtn}>
          <Ionicons name="chevron-down" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {sessionName}
          </Text>
          {/* in progress workout timer */}
          <Text style={[styles.headerTimer, { color: theme.textSecondary }]}>
            {formatTime(elapsedSec)}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.finishBtn, { backgroundColor: Colors.success }]}
          onPress={handleFinish}
        >
          <Text style={styles.finishBtnText}>Finish</Text>
        </TouchableOpacity>
      </View>

      {/* Exercise list with drag-to-reorder */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <ScrollView
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={draggingIdx === -1}
        >
          {activeGroups.length === 0 && completedGroups.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons
                name="barbell-outline"
                size={48}
                color={theme.textMuted}
              />
              <Text style={[styles.emptyStateText, { color: theme.textMuted }]}>
                {templateId
                  ? "Loading exercises…"
                  : 'Tap "Add Exercise" to begin'}
              </Text>
            </View>
          )}

          {activeGroups.map((group, idx) => {
            const isDragging = draggingIdx === idx;
            // Top indicator: dragged item comes from below → will insert before this item
            // Bottom indicator: dragged item comes from above → will insert after this item
            const hoverIndicator: "top" | "bottom" | null =
              !isDragging && hoverIdx === idx
                ? draggingIdx > idx
                  ? "top"
                  : "bottom"
                : null;
            return (
              <View
                key={group.exercise.id}
                ref={(r) => {
                  itemRefs.current[idx] = r;
                }}
              >
                <Animated.View
                  style={[
                    isDragging && {
                      transform: [{ translateY: dragYAnim }],
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.25,
                      shadowRadius: 10,
                      elevation: 10,
                      zIndex: 999,
                    },
                  ]}
                >
                  <ExerciseGroupCard
                    group={group}
                    theme={theme}
                    styles={styles}
                    unit={unit}
                    isDragging={isDragging}
                    hoverIndicator={hoverIndicator}
                    onDragStart={(pageY) => startDrag(idx, pageY)}
                    onAddSet={() => handleAddSet(group.exercise.id)}
                    onUpdateSet={handleUpdateSet}
                    onDeleteSet={handleDeleteSet}
                    onFinish={() => finishExercise(group.exercise.id)}
                    onMoveToTop={() => moveToTop(idx)}
                    onMoveToBottom={() => moveToBottom(idx)}
                  />
                </Animated.View>
              </View>
            );
          })}

          {completedGroups.length > 0 && (
            <View style={styles.completedSection}>
              <Text
                style={[
                  styles.completedSectionTitle,
                  { color: theme.textMuted },
                ]}
              >
                COMPLETED
              </Text>
              {completedGroups.map((g) => (
                <CompletedExerciseCard
                  key={g.exercise.id}
                  group={g}
                  theme={theme}
                  styles={styles}
                  onUndo={() => unfinishExercise(g.exercise.id)}
                />
              ))}
            </View>
          )}
        </ScrollView>
        {/* Sticky rest timer — always visible below the header */}
        <View style={{ backgroundColor: theme.background }}>
          <WorkoutTimer theme={theme} />
        </View>
        <TouchableOpacity
          style={[styles.addExBtn, { borderColor: Colors.accent }]}
          onPress={openPicker}
        >
          <Ionicons name="add-circle" size={20} color={theme.textSecondary} />
          <Text style={[styles.addExText, { color: theme.textSecondary }]}>
            Add Exercise
          </Text>
        </TouchableOpacity>
      </View>

      {/* Exercise picker + create form — single modal to avoid iOS modal stacking */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setPickerVisible(false);
          setPickerView("list");
        }}
      >
        <KeyboardAvoidingView
          style={[
            styles.pickerContainer,
            { backgroundColor: theme.background },
          ]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Drag indicator */}
          <View style={styles.dragHandle}>
            <View style={[styles.dragPill, { backgroundColor: "#78788066" }]} />
          </View>
          <View
            style={[styles.pickerHeader, { borderBottomColor: theme.border }]}
          >
            {pickerView === "list" ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    setPickerVisible(false);
                    setPickerView("list");
                  }}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 16 }}>
                    Done
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>
                  Add Exercise
                </Text>
                <View style={{ width: 50 }} />
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => setPickerView("list")}>
                  <Text style={{ color: theme.textSecondary, fontSize: 16 }}>
                    Back
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>
                  New Exercise
                </Text>
                <View style={{ width: 50 }} />
              </>
            )}
          </View>

          {pickerView === "list" ? (
            <>
              <View
                style={[
                  styles.pickerSearch,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                ]}
              >
                <Ionicons name="search" size={16} color={theme.textMuted} />
                <TextInput
                  style={[{ flex: 1, fontSize: 15, color: theme.text }]}
                  placeholder="Search…"
                  placeholderTextColor={theme.textMuted}
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipRow}
                keyboardShouldPersistTaps="handled"
              >
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      {
                        backgroundColor: !pickerMuscleFilter
                          ? Colors.accent
                          : theme.card,
                        borderColor: !pickerMuscleFilter
                          ? Colors.accent
                          : theme.border,
                      },
                    ]}
                    onPress={() => setPickerMuscleFilter(null)}
                  >
                    <Text
                      style={{
                        color: !pickerMuscleFilter
                          ? "#fff"
                          : theme.textSecondary,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {MUSCLE_GROUPS.map((mg) => (
                    <TouchableOpacity
                      key={mg}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            pickerMuscleFilter === mg
                              ? Colors.accent
                              : theme.card,
                          borderColor:
                            pickerMuscleFilter === mg
                              ? Colors.accent
                              : theme.border,
                        },
                      ]}
                      onPress={() =>
                        setPickerMuscleFilter(
                          pickerMuscleFilter === mg ? null : mg,
                        )
                      }
                    >
                      <Text
                        style={{
                          color:
                            pickerMuscleFilter === mg
                              ? "#fff"
                              : theme.textSecondary,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {mg}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
              {/* Create New Exercise shortcut */}
              <TouchableOpacity
                style={[
                  styles.createExBtn,
                  { borderColor: Colors.accent, marginHorizontal: 12 },
                ]}
                onPress={() => {
                  setNewExName("");
                  setNewExMuscle(MUSCLE_GROUPS[0]);
                  setNewExReps("10");
                  setNewExWeight("");
                  setPickerView("create");
                }}
              >
                <Ionicons
                  name="add-circle"
                  size={16}
                  color={theme.textSecondary}
                />
                <Text
                  style={[
                    styles.createExBtnText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Create New Exercise
                </Text>
              </TouchableOpacity>
              <FlatList
                data={filteredPicker}
                keyExtractor={(e) => String(e.id)}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      { borderBottomColor: theme.border },
                    ]}
                    onPress={() => addExerciseThenSet(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.pickerItemName, { color: theme.text }]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{ color: theme.textSecondary, fontSize: 13 }}
                      >
                        {item.muscle_group}
                      </Text>
                    </View>
                    <Ionicons
                      name="add-circle"
                      size={22}
                      color={Colors.accent}
                    />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text
                    style={{
                      color: theme.textMuted,
                      textAlign: "center",
                      paddingTop: 40,
                    }}
                  >
                    No exercises found.
                  </Text>
                }
              />
            </>
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  letterSpacing: 0.6,
                  color: theme.textSecondary,
                  marginBottom: 6,
                }}
              >
                EXERCISE NAME *
              </Text>
              <TextInput
                style={[
                  {
                    borderRadius: 10,
                    borderWidth: 1,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 16,
                    marginBottom: 20,
                    backgroundColor: theme.inputBg,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="e.g. Barbell Curl"
                placeholderTextColor={theme.textMuted}
                value={newExName}
                onChangeText={setNewExName}
                autoFocus
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  letterSpacing: 0.6,
                  color: theme.textSecondary,
                  marginBottom: 8,
                }}
              >
                MUSCLE GROUP
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipRow}
              >
                  {MUSCLE_GROUPS.map((mg) => (
                    <TouchableOpacity
                      key={mg}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            newExMuscle === mg ? Colors.accent : theme.card,
                          borderColor:
                            newExMuscle === mg ? Colors.accent : theme.border,
                        },
                      ]}
                      onPress={() => setNewExMuscle(mg)}
                    >
                      <Text
                        style={{
                          color:
                            newExMuscle === mg ? "#fff" : theme.textSecondary,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {mg}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      letterSpacing: 0.6,
                      color: theme.textSecondary,
                      marginBottom: 6,
                    }}
                  >
                    DEFAULT REPS
                  </Text>
                  <TextInput
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 16,
                      marginBottom: 20,
                      backgroundColor: theme.inputBg,
                      borderColor: theme.border,
                      color: theme.text,
                    }}
                    value={newExReps}
                    onChangeText={setNewExReps}
                    keyboardType="number-pad"
                    selectTextOnFocus
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      letterSpacing: 0.6,
                      color: theme.textSecondary,
                      marginBottom: 6,
                    }}
                  >
                    DEFAULT WEIGHT ({unit.toUpperCase()})
                  </Text>
                  <TextInput
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 16,
                      marginBottom: 20,
                      backgroundColor: theme.inputBg,
                      borderColor: theme.border,
                      color: theme.text,
                    }}
                    value={newExWeight}
                    onChangeText={setNewExWeight}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    placeholder="0"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={{
                  backgroundColor: newExSaving
                    ? Colors.accent + "88"
                    : Colors.accent,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
                onPress={handleCreateNewExercise}
                disabled={newExSaving}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}
                >
                  Save & Add to Workout
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ExerciseGroupCard
// ──────────────────────────────────────────────────────────────────────────────

type GroupCardProps = {
  group: ExerciseGroup;
  theme: (typeof Colors)["light"];
  styles: ReturnType<typeof makeStyles>;
  unit: string;
  isDragging: boolean;
  hoverIndicator: "top" | "bottom" | null;
  onDragStart: (pageY: number) => void;
  onAddSet: () => void;
  onUpdateSet: (id: number, reps: number, weight: number) => void;
  onDeleteSet: (id: number) => void;
  onFinish: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
};

function ExerciseGroupCard({
  group,
  theme,
  styles,
  unit,
  isDragging,
  hoverIndicator,
  onDragStart,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onFinish,
  onMoveToTop,
  onMoveToBottom,
}: GroupCardProps) {
  return (
    <View
      style={[
        styles.groupCard,
        {
          backgroundColor: hoverIndicator ? Colors.accent + "12" : theme.card,
          borderColor: theme.border,
          borderTopColor:
            hoverIndicator === "top" ? Colors.accent : theme.border,
          borderTopWidth: hoverIndicator === "top" ? 3 : 1,
          borderBottomColor:
            hoverIndicator === "bottom" ? Colors.accent : theme.border,
          borderBottomWidth: hoverIndicator === "bottom" ? 3 : 1,
          shadowColor: hoverIndicator ? Colors.accent : undefined,
          shadowOpacity: hoverIndicator ? 0.35 : 0,
          shadowRadius: hoverIndicator ? 6 : 0,
          shadowOffset: hoverIndicator
            ? { width: 0, height: hoverIndicator === "top" ? -3 : 3 }
            : { width: 0, height: 0 },
          opacity: isDragging ? 0.6 : 1,
        },
      ]}
    >
      {/* Top row: drag handle + exercise name/muscle + done button */}
      <View style={styles.cardTopRow}>
        <TouchableOpacity
          onLongPress={(e) => onDragStart(e.nativeEvent.pageY)}
          delayLongPress={200}
          activeOpacity={0.6}
          style={styles.dragHandleBtn}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Ionicons
            name="reorder-three"
            size={24}
            color={isDragging ? Colors.accent : theme.textMuted}
          />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupName, { color: theme.text }]}>
            {group.exercise.name}
          </Text>
          <Text style={[styles.groupMuscle, { color: theme.textSecondary }]}>
            {group.exercise.muscle_group}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.finishExBtn, { backgroundColor: Colors.success + "22" }]}
          onPress={onFinish}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={14}
            color={Colors.success}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.finishExBtnText, { color: Colors.success }]}>
            Done
          </Text>
        </TouchableOpacity>
      </View>

      {/* Body: move arrows + sets */}
      <View style={styles.groupCardBody}>
        <View style={styles.moveButtonsCol}>
          <TouchableOpacity
            onPress={onMoveToTop}
            hitSlop={{ top: 6, bottom: 4, left: 8, right: 8 }}
            style={styles.moveButton}
          >
            <Ionicons name="chevron-up" size={22} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveToBottom}
            hitSlop={{ top: 4, bottom: 6, left: 8, right: 8 }}
            style={styles.moveButton}
          >
            <Ionicons name="chevron-down" size={22} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.groupCardMain}>
          {/* Column headers */}
          <View style={styles.setHeaderRow}>
            <Text
              style={[
                styles.setHeaderText,
                { color: theme.textMuted, width: 30 },
              ]}
            >
              SET
            </Text>
            <Text
              style={[
                styles.setHeaderText,
                { color: theme.textMuted, flex: 1, paddingLeft: 8 },
              ]}
            >
              REPS
            </Text>
            <Text
              style={[
                styles.setHeaderText,
                { color: theme.textMuted, flex: 1, paddingLeft: 8 },
              ]}
            >
              {unit.toUpperCase()}
            </Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Sets */}
          {group.sets.map((set) => (
            <SetRow
              key={`${set.id}-${unit}`}
              set={set}
              theme={theme}
              styles={styles}
              unit={unit}
              onUpdate={onUpdateSet}
              onDelete={onDeleteSet}
            />
          ))}

          {/* Add set button */}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.addSetBtn, { borderColor: theme.border }]}
        onPress={onAddSet}
      >
        <Ionicons name="add" size={16} color={theme.textSecondary} />
        <Text style={[styles.addSetText, { color: theme.textSecondary }]}>
          Add Set
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// CompletedExerciseCard
// ──────────────────────────────────────────────────────────────────────────────

type CompletedCardProps = {
  group: ExerciseGroup;
  theme: (typeof Colors)["light"];
  styles: ReturnType<typeof makeStyles>;
  onUndo: () => void;
};

function CompletedExerciseCard({
  group,
  theme,
  styles,
  onUndo,
}: CompletedCardProps) {
  return (
    <View
      style={[
        styles.completedCard,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text
          style={[styles.groupName, { color: theme.text }]}
          numberOfLines={1}
        >
          {group.exercise.name}
        </Text>
        <Text style={[styles.groupMuscle, { color: theme.textSecondary }]}>
          {group.exercise.muscle_group} · {group.sets.length} set
          {group.sets.length !== 1 ? "s" : ""}
        </Text>
      </View>
      <TouchableOpacity onPress={onUndo} style={{ padding: 6 }}>
        <Ionicons name="arrow-undo-outline" size={18} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SetRow
// ──────────────────────────────────────────────────────────────────────────────

type SetRowProps = {
  set: SessionSet;
  theme: (typeof Colors)["light"];
  styles: ReturnType<typeof makeStyles>;
  unit: string;
  onUpdate: (id: number, reps: number, weight: number) => void;
  onDelete: (id: number) => void;
};

function SetRow({ set, theme, styles, unit, onUpdate, onDelete }: SetRowProps) {
  const [reps, setReps] = useState(set.reps > 0 ? String(set.reps) : "");
  // Stored weights are always in lbs; convert for display when unit is kg
  const storedToDisplay = (lbs: number) =>
    unit === "kg" ? String(Math.round((lbs / 2.20462) * 10) / 10) : String(lbs);
  const [weight, setWeight] = useState(
    set.weight > 0 ? storedToDisplay(set.weight) : "",
  );

  function commit() {
    const r = Number(reps) || 0;
    const rawW = Number(weight) || 0;
    // Convert input back to lbs for storage
    const wInLbs =
      unit === "kg" ? Math.round(rawW * 2.20462 * 100) / 100 : rawW;
    if (r !== set.reps || Math.abs(wInLbs - set.weight) > 0.01) {
      onUpdate(set.id, r, wInLbs);
    }
  }

  return (
    <View style={styles.setRow}>
      <View
        style={[
          styles.setNumBadge,
          { backgroundColor: Colors.badgeAccent + "22" },
        ]}
      >
        <Text style={[styles.setNum, { color: theme.badgeText }]}>
          {set.set_number}
        </Text>
      </View>
      <TextInput
        style={[
          styles.setInput,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        value={reps}
        onChangeText={setReps}
        onBlur={commit}
        keyboardType="number-pad"
        placeholder="—"
        placeholderTextColor={theme.textMuted}
        selectTextOnFocus
        returnKeyType="next"
      />
      <TextInput
        style={[
          styles.setInput,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        value={weight}
        onChangeText={setWeight}
        onBlur={commit}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={theme.textMuted}
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
      />
      <TouchableOpacity
        style={styles.deleteSetBtn}
        onPress={() => onDelete(set.id)}
      >
        <Ionicons
          name="remove-circle-outline"
          size={22}
          color={Colors.danger}
        />
      </TouchableOpacity>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────────

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      paddingTop: Platform.OS === "ios" ? 56 : 16,
    },
    headerBtn: { padding: 6 },
    headerCenter: { flex: 1, alignItems: "center" },
    headerName: { fontSize: 16, fontWeight: "700" },
    headerTimer: { fontSize: 13, fontWeight: "600" },
    finishBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
    finishBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    listContent: { padding: 12, paddingBottom: 80 },
    groupCard: {
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
    },
    cardTopRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
      gap: 8,
    },
    groupCardBody: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 8,
    },
    groupCardMain: { flex: 1 },
    moveButtonsCol: {
      width: 28,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    moveButton: {
      alignItems: "center",
      justifyContent: "center",
    },
    dragHandleBtn: {
      width: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    groupName: { fontSize: 17, fontWeight: "700" },
    groupMuscle: { fontSize: 12, marginTop: 2 },
    setHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
      gap: 8,
    },
    setHeaderText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
      gap: 8,
    },
    setNumBadge: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    setNum: { fontSize: 13, fontWeight: "700" },
    setInput: {
      flex: 0.9,
      height: 44,
      borderRadius: 8,
      borderWidth: 1,
      textAlign: "center",
      fontSize: 16,
      fontWeight: "600",
    },
    deleteSetBtn: { width: 32, alignItems: "center" },
    addSetBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: "dashed",
      marginTop: 4,
    },
    addSetText: { fontSize: 14, fontWeight: "500" },
    addExBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderRadius: 12,
      marginHorizontal: 28,
      paddingVertical: 14,
      marginTop: 12,
      marginBottom: 22,
    },
    addExText: { fontSize: 15, fontWeight: "600" },
    emptyState: {
      alignItems: "center",
      paddingTop: 60,
      gap: 14,
    },
    emptyStateText: { fontSize: 15, textAlign: "center" },
    // Picker
    pickerContainer: { flex: 1 },
    chipScroll: { marginHorizontal: 12, marginBottom: 10, maxHeight: 48, flexShrink: 0 },
    chipRow: { paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", gap: 8 },
    dragHandle: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
    dragPill: { width: 36, height: 4, borderRadius: 2 },
    pickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderBottomWidth: 1,
    },
    pickerTitle: { fontSize: 17, fontWeight: "600" },
    pickerSearch: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      margin: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
    },
    pickerItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    pickerItemName: { fontSize: 16, fontWeight: "500" },
    // Create new exercise button in picker
    createExBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderRadius: 10,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    createExBtnText: { fontSize: 14, fontWeight: "600" },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    // Finish exercise
    finishExBtn: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    finishExBtnText: { fontSize: 12, fontWeight: "700" },
    completedSection: { paddingTop: 4, paddingBottom: 8 },
    completedSectionTitle: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      paddingHorizontal: 2,
      paddingTop: 4,
      paddingBottom: 8,
    },
    completedCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
    },
  });
}
