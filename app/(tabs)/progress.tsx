import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import { MUSCLE_GROUPS } from "@/constants/MuscleGroups";
import MuscleHeatmap from "@/src/components/MuscleHeatmap";
import {
  Exercise,
  MuscleGroupVolume,
  ProgressPoint,
  getAllTimeMuscleGroupVolumes,
  getAllVolumeProgress,
  getExerciseProgress,
  getExercises,
  getMuscleGroupProgress,
} from "@/src/db/database";
import { useUnit } from "@/src/UnitContext";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LineChart } from "react-native-gifted-charts";

const SCREEN_WIDTH = Dimensions.get("window").width;

type ChartMode = "weight" | "volume";
type TrackMode = "exercise" | "muscle_group" | "total";

function formatDate(dateStr: string) {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
}

export default function ProgressScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const styles = makeStyles(theme);
  const { unit } = useUnit();

  // All session weights are stored as lbs. Convert for display.
  const toDisplay = (lbs: number) =>
    unit === "kg"
      ? Math.round((lbs / 2.20462) * 10) / 10
      : Math.round(lbs * 10) / 10;

  const [trackMode, setTrackMode] = useState<TrackMode>("exercise");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null,
  );
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string>(
    MUSCLE_GROUPS[0],
  );
  const [progress, setProgress] = useState<ProgressPoint[]>([]);
  const [mode, setMode] = useState<ChartMode>("weight");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [mgPickerVisible, setMgPickerVisible] = useState(false);
  const [allTimeMuscleVolumes, setAllTimeMuscleVolumes] = useState<
    MuscleGroupVolume[]
  >([]);

  useFocusEffect(
    useCallback(() => {
      getExercises().then((exs) => {
        setExercises(exs);
        if (!selectedExercise && exs.length > 0) {
          selectExercise(exs[0]);
        }
      });
      getAllTimeMuscleGroupVolumes()
        .then(setAllTimeMuscleVolumes)
        .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Reload when trackMode or selectedMuscleGroup changes
  useFocusEffect(
    useCallback(() => {
      if (trackMode === "muscle_group") {
        getMuscleGroupProgress(selectedMuscleGroup).then(setProgress);
      } else if (trackMode === "total") {
        getAllVolumeProgress().then(setProgress);
      }
    }, [trackMode, selectedMuscleGroup]),
  );

  async function selectExercise(ex: Exercise) {
    setSelectedExercise(ex);
    const pts = await getExerciseProgress(ex.id);
    setProgress(pts);
    setPickerVisible(false);
    setTrackMode("exercise");
  }

  async function handleTrackModeChange(m: TrackMode) {
    setTrackMode(m);
    if (m === "exercise") {
      if (selectedExercise) {
        const pts = await getExerciseProgress(selectedExercise.id);
        setProgress(pts);
      }
      // weight chart makes sense for exercise
    } else if (m === "muscle_group") {
      setMode("volume");
      const pts = await getMuscleGroupProgress(selectedMuscleGroup);
      setProgress(pts);
    } else {
      setMode("volume");
      const pts = await getAllVolumeProgress();
      setProgress(pts);
    }
  }

  const chartData = progress.map((p) => {
    const rawVal = mode === "weight" ? p.max_weight : p.total_volume;
    const displayVal = toDisplay(rawVal);
    return {
      value: displayVal,
      label: formatDate(p.date),
      dataPointText:
        mode === "weight"
          ? `${displayVal}`
          : `${Math.round(displayVal).toLocaleString()}`,
    };
  });

  const maxChartVal =
    chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 0;
  const chartMaxValue =
    maxChartVal > 0 ? Math.ceil(maxChartVal * 1.1) : undefined;

  const pr = progress.reduce((best, p) => {
    const v = toDisplay(p.max_weight);
    return v > best ? v : best;
  }, 0);

  const latestVol =
    progress.length > 0
      ? Math.round(toDisplay(progress[progress.length - 1].total_volume))
      : 0;

  const filteredPicker = exercises.filter((e) =>
    e.name.toLowerCase().includes(pickerSearch.toLowerCase()),
  );

  const chartWidth = SCREEN_WIDTH - 48;

  // Human-readable label for the current selection
  const selectionLabel =
    trackMode === "exercise"
      ? (selectedExercise?.name ?? "Select an exercise…")
      : trackMode === "muscle_group"
        ? selectedMuscleGroup
        : "All Exercises";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Track-by mode toggle */}
      <View
        style={[
          styles.modeRow,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {(
          [
            { key: "exercise", label: "Exercise" },
            { key: "muscle_group", label: "Muscle" },
            { key: "total", label: "Overall" },
          ] as { key: TrackMode; label: string }[]
        ).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.modeBtn,
              trackMode === key && { backgroundColor: Colors.accent },
            ]}
            onPress={() => handleTrackModeChange(key)}
          >
            <Text
              style={[
                styles.modeBtnText,
                { color: trackMode === key ? "#fff" : theme.textSecondary },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Selector: exercise picker or muscle group picker */}
      {trackMode !== "total" && (
        <TouchableOpacity
          style={[
            styles.selector,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          onPress={() => {
            if (trackMode === "exercise") {
              setPickerSearch("");
              setPickerVisible(true);
            } else {
              setMgPickerVisible(true);
            }
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.selectorLabel, { color: theme.textMuted }]}>
              {trackMode === "exercise" ? "EXERCISE" : "MUSCLE GROUP"}
            </Text>
            <Text
              style={[
                styles.selectorName,
                {
                  color: selectionLabel.endsWith("…")
                    ? theme.textMuted
                    : theme.text,
                },
              ]}
            >
              {selectionLabel}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      )}

      {progress.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="bar-chart-outline"
            size={48}
            color={theme.textMuted}
          />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            {trackMode === "total"
              ? "No completed workouts yet.\nLog some sessions to see overall progress!"
              : trackMode === "muscle_group"
                ? `No sessions with ${selectedMuscleGroup} exercises yet.\nLog a workout to see progress!`
                : `No completed sessions with ${selectedExercise?.name ?? "this exercise"} yet.\nLog a workout to see progress!`}
          </Text>
        </View>
      ) : null}

      {progress.length > 0 ? (
        <>
          {/* Body heatmap — shown on Overall tab */}
          {trackMode === "total" && allTimeMuscleVolumes.length > 0 && (
            <View
              style={[
                styles.chartCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.chartTitle, { color: theme.text }]}>
                All-Time Muscle Activity
              </Text>
              <MuscleHeatmap muscleVolumes={allTimeMuscleVolumes} />
            </View>
          )}

          {/* Stats row */}
          <View style={styles.statsRow}>
            {trackMode === "exercise" && (
              <View
                style={[
                  styles.statCard,
                  {
                    backgroundColor: theme.tint + "18",
                    borderColor: theme.tint + "44",
                  },
                ]}
              >
                <Text style={[styles.statValue, { color: theme.tint }]}>
                  {pr} {unit}
                </Text>
                <Text style={[styles.statLabel, { color: theme.tint }]}>
                  All-time PR
                </Text>
              </View>
            )}
            <View
              style={[
                styles.statCard,
                {
                  backgroundColor: Colors.teal + "18",
                  borderColor: Colors.teal + "44",
                },
              ]}
            >
              <Text style={[styles.statValue, { color: Colors.teal }]}>
                {progress.length}
              </Text>
              <Text style={[styles.statLabel, { color: Colors.teal }]}>
                Sessions
              </Text>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.statValue, { color: theme.text }]}>
                {latestVol.toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Last vol ({unit})
              </Text>
            </View>
          </View>

          {/* Chart mode toggle — weight only relevant for exercise mode */}
          {trackMode === "exercise" && (
            <View
              style={[
                styles.chartModeRow,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              {(["weight", "volume"] as ChartMode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.modeBtn,
                    mode === m && { backgroundColor: Colors.accent },
                  ]}
                  onPress={() => setMode(m)}
                >
                  <Text
                    style={[
                      styles.modeBtnText,
                      { color: mode === m ? "#fff" : theme.textSecondary },
                    ]}
                  >
                    {m === "weight" ? "Max Weight" : "Total Volume"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Chart */}
          <View
            style={[
              styles.chartCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.chartTitle, { color: theme.text }]}>
              {trackMode === "exercise" && mode === "weight"
                ? `Max Weight (${unit})`
                : `Total Volume (${unit})`}
            </Text>
            <LineChart
              data={chartData}
              width={chartWidth - 32}
              height={200}
              maxValue={chartMaxValue}
              color={theme.tint}
              thickness={2.5}
              dataPointsColor={theme.tint}
              dataPointsRadius={4}
              curved
              hideDataPoints={progress.length > 20}
              startFillColor={theme.tint}
              endFillColor={theme.tint}
              startOpacity={0.18}
              endOpacity={0.01}
              areaChart
              xAxisLabelTextStyle={{ color: theme.textMuted, fontSize: 10 }}
              yAxisTextStyle={{ color: theme.textMuted, fontSize: 10 }}
              yAxisColor={theme.border}
              xAxisColor={theme.border}
              noOfSections={4}
              rulesColor={theme.border}
              rulesType="solid"
              showVerticalLines={false}
              adjustToWidth
            />
          </View>

          {/* Recent data table */}
          <Text style={[styles.tableTitle, { color: theme.textMuted }]}>
            SESSION HISTORY
          </Text>
          {[...progress]
            .reverse()
            .slice(0, 10)
            .map((p, i) => (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  {
                    borderBottomColor: theme.border,
                    backgroundColor: i % 2 === 0 ? theme.card : "transparent",
                  },
                ]}
              >
                <Text
                  style={[styles.tableDate, { color: theme.textSecondary }]}
                >
                  {p.date}
                </Text>
                <Text style={[styles.tableCell, { color: theme.text }]}>
                  {toDisplay(p.max_weight)} {unit}
                </Text>
                <Text
                  style={[styles.tableCell, { color: theme.textSecondary }]}
                >
                  {Math.round(toDisplay(p.total_volume)).toLocaleString()} vol
                </Text>
              </View>
            ))}
        </>
      ) : null}

      {/* Exercise picker modal */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View
          style={[
            styles.pickerContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <View
            style={[styles.pickerHeader, { borderBottomColor: theme.border }]}
          >
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Text style={{ color: theme.tint, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>
              Select Exercise
            </Text>
            <View style={{ width: 60 }} />
          </View>
          <View
            style={[
              styles.pickerSearch,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
            ]}
          >
            <Ionicons name="search" size={16} color={theme.textMuted} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: theme.text }}
              placeholder="Search…"
              placeholderTextColor={theme.textMuted}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredPicker}
            keyExtractor={(e) => String(e.id)}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  { borderBottomColor: theme.border },
                  selectedExercise?.id === item.id && {
                    backgroundColor: theme.tint + "15",
                  },
                ]}
                onPress={() => selectExercise(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerItemName, { color: theme.text }]}>
                    {item.name}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                    {item.muscle_group}
                  </Text>
                </View>
                {selectedExercise?.id === item.id && (
                  <Ionicons name="checkmark" size={20} color={theme.tint} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Muscle group picker modal */}
      <Modal
        visible={mgPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMgPickerVisible(false)}
      >
        <View
          style={[
            styles.pickerContainer,
            { backgroundColor: theme.background },
          ]}
        >
          {/* Drag indicator — same pill that the exercise picker gets from iOS */}
          <View style={styles.dragIndicatorRow}>
            <View
              style={[styles.dragIndicator, { backgroundColor: theme.border }]}
            />
          </View>
          <View
            style={[styles.pickerHeader, { borderBottomColor: theme.border }]}
          >
            <TouchableOpacity onPress={() => setMgPickerVisible(false)}>
              <Text style={{ color: theme.tint, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>
              Select Muscle Group
            </Text>
            <View style={{ width: 60 }} />
          </View>
          <FlatList
            data={MUSCLE_GROUPS as unknown as string[]}
            keyExtractor={(g) => g}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item: group }) => (
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  { borderBottomColor: theme.border },
                  selectedMuscleGroup === group && {
                    backgroundColor: theme.tint + "15",
                  },
                ]}
                onPress={async () => {
                  setSelectedMuscleGroup(group);
                  setMgPickerVisible(false);
                  const pts = await getMuscleGroupProgress(group);
                  setProgress(pts);
                }}
              >
                <Text style={[styles.pickerItemName, { color: theme.text }]}>
                  {group}
                </Text>
                {selectedMuscleGroup === group && (
                  <Ionicons name="checkmark" size={20} color={theme.tint} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { padding: 16, paddingBottom: 60 },
    selector: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
    },
    selectorLabel: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    selectorName: { fontSize: 17, fontWeight: "600" },
    emptyState: { alignItems: "center", paddingTop: 60, gap: 14 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 22 },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1,
      borderRadius: 12,
      padding: 12,
      alignItems: "center",
      borderWidth: 1,
    },
    statValue: { fontSize: 17, fontWeight: "700" },
    statLabel: { fontSize: 11, marginTop: 2, fontWeight: "500" },
    modeRow: {
      flexDirection: "row",
      borderRadius: 12,
      padding: 3,
      marginBottom: 16,
      borderWidth: 1,
    },
    chartModeRow: {
      flexDirection: "row",
      borderRadius: 12,
      padding: 3,
      marginBottom: 16,
      borderWidth: 1,
    },
    modeBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      alignItems: "center",
    },
    modeBtnText: { fontSize: 14, fontWeight: "600" },
    chartCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      overflow: "hidden",
    },
    chartTitle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
    tableTitle: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderRadius: 6,
    },
    tableDate: { width: 100, fontSize: 13 },
    tableCell: { flex: 1, fontSize: 13 },
    // Picker
    pickerContainer: { flex: 1 },
    dragIndicatorRow: {
      alignItems: "center",
      paddingTop: 8,
      paddingBottom: 4,
    },
    dragIndicator: {
      width: 36,
      height: 4,
      borderRadius: 2,
    },
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
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      paddingLeft: 8,
    },
    pickerItemName: { fontSize: 16, fontWeight: "500" },
  });
}
