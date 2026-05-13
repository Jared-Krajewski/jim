import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import MuscleHeatmap from "@/src/components/MuscleHeatmap";
import {
  MuscleGroupVolume,
  SessionSet,
  WorkoutSession,
  getSession,
  getSessionMuscleGroupVolumes,
  getSessionSets,
} from "@/src/db/database";
import { useUnit } from "@/src/UnitContext";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ExerciseGroup = {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string;
  sets: SessionSet[];
};

function groupSets(sets: SessionSet[]): ExerciseGroup[] {
  const map = new Map<number, ExerciseGroup>();
  for (const s of sets) {
    if (!map.has(s.exercise_id)) {
      map.set(s.exercise_id, {
        exerciseId: s.exercise_id,
        exerciseName: s.exercise_name,
        muscleGroup: s.muscle_group,
        sets: [],
      });
    }
    map.get(s.exercise_id)!.sets.push(s);
  }
  return Array.from(map.values());
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatElapsed(
  startedAt: number | null,
  completedAt: number | null,
): string {
  if (!startedAt || !completedAt) return "";
  // started_at and completed_at are Unix timestamps in seconds (not ms)
  const totalSeconds = completedAt - startedAt;
  if (totalSeconds <= 0) return "";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const styles = makeStyles(theme);
  const router = useRouter();
  const { unit } = useUnit();

  // Convert stored-lbs value to display unit
  const toDisplay = (lbs: number) =>
    unit === "kg" ? Math.round((lbs / 2.20462) * 10) / 10 : lbs;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [muscleVolumes, setMuscleVolumes] = useState<MuscleGroupVolume[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = Number(id);
    setLoading(true);
    Promise.all([
      getSession(sessionId),
      getSessionSets(sessionId),
      getSessionMuscleGroupVolumes(sessionId),
    ])
      .then(([sess, sets, mvols]) => {
        setSession(sess);
        setGroups(groupSets(sets));
        setMuscleVolumes(mvols);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const backBtn = (
    <TouchableOpacity
      onPress={() => router.back()}
      style={{ paddingHorizontal: 8, paddingVertical: 4 }}
    >
      <Ionicons name="chevron-back" size={24} color={theme.tint} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Session Details", headerLeft: () => backBtn }}
        />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.background,
          }}
        >
          <ActivityIndicator color={theme.tint} />
        </View>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Session Details", headerLeft: () => backBtn }}
        />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.background,
          }}
        >
          <Text style={{ color: theme.textMuted }}>Session not found.</Text>
        </View>
      </>
    );
  }

  const totalSets = groups.reduce((acc, g) => acc + g.sets.length, 0);
  const totalVolume = groups
    .flatMap((g) => g.sets)
    .reduce((acc, s) => acc + s.reps * toDisplay(s.weight), 0);

  return (
    <>
      <Stack.Screen
        options={{ title: "Session Details", headerLeft: () => backBtn }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 0,
          }}
        >
          <Text
            style={[
              styles.date,
              { color: theme.textSecondary, marginBottom: 0 },
            ]}
          >
            {formatDate(session.date)}
          </Text>
          {formatElapsed(session.started_at, session.completed_at) ? (
            <Text
              style={[styles.date, { color: theme.textMuted, marginBottom: 0 }]}
            >
              {formatElapsed(session.started_at, session.completed_at)}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.name, { color: theme.text }]}>{session.name}</Text>

        {/* Summary pills */}
        <View style={styles.summaryRow}>
          <View
            style={[
              styles.summaryPill,
              { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.summaryValue, { color: theme.text }]}> 
              {groups.length}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}> 
              exercises
            </Text>
          </View>
          <View
            style={[
              styles.summaryPill,
              { backgroundColor: Colors.teal + "22" },
            ]}
          >
            <Text style={[styles.summaryValue, { color: Colors.teal }]}>
              {totalSets}
            </Text>
            <Text style={[styles.summaryLabel, { color: Colors.teal }]}>
              sets
            </Text>
          </View>
          <View
            style={[
              styles.summaryPill,
              {
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.summaryValue, { color: theme.text }]}>
              {totalVolume.toLocaleString()}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
              total {unit}
            </Text>
          </View>
        </View>

        {/* Muscle heatmap for this workout */}
        {muscleVolumes.length > 0 && (
          <View
            style={[
              styles.heatmapCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.heatmapTitle, { color: theme.text }]}>
              Muscles Worked
            </Text>
            <MuscleHeatmap muscleVolumes={muscleVolumes} />
          </View>
        )}

        {/* Exercise groups */}
        {groups.map((group) => {
          const maxWeight = Math.max(...group.sets.map((s) => s.weight));
          return (
            <View
              key={group.exerciseId}
              style={[
                styles.groupCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <View style={styles.groupHeader}>
                <Text style={[styles.groupName, { color: theme.text }]}>
                  {group.exerciseName}
                </Text>
                <Text
                  style={[styles.groupMuscle, { color: theme.textSecondary }]}
                >
                  {group.muscleGroup}
                </Text>
              </View>

              {/* Column headers */}
              <View style={styles.colHeaders}>
                <Text
                  style={[
                    styles.colHeader,
                    { color: theme.textMuted, width: 36 },
                  ]}
                >
                  SET
                </Text>
                <Text
                  style={[
                    styles.colHeader,
                    { color: theme.textMuted, flex: 1 },
                  ]}
                >
                  REPS
                </Text>
                <Text
                  style={[
                    styles.colHeader,
                    { color: theme.textMuted, flex: 1 },
                  ]}
                >
                  WEIGHT
                </Text>
                <Text
                  style={[
                    styles.colHeader,
                    { color: theme.textMuted, flex: 1 },
                  ]}
                >
                  VOL
                </Text>
              </View>

              {group.sets.map((s) => (
                <View
                  key={s.id}
                  style={[styles.setRow, { borderBottomColor: theme.border }]}
                >
                  <View
                    style={[
                      styles.setNumBadge,
                      {
                        backgroundColor:
                          s.weight === maxWeight && maxWeight > 0
                            ? Colors.teal + "22"
                            : theme.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.setNum,
                        {
                          color:
                            s.weight === maxWeight && maxWeight > 0
                              ? Colors.teal
                              : theme.textMuted,
                        },
                      ]}
                    >
                      {s.set_number}
                    </Text>
                  </View>
                  <Text style={[styles.setCell, { color: theme.text }]}>
                    {s.reps}
                  </Text>
                  <Text style={[styles.setCell, { color: theme.text }]}>
                    {toDisplay(s.weight)} {unit}
                  </Text>
                  <Text
                    style={[styles.setCell, { color: theme.textSecondary }]}
                  >
                    {Math.round(s.reps * toDisplay(s.weight)).toLocaleString()}
                  </Text>
                </View>
              ))}

              {/* Max weight pill */}
              {maxWeight > 0 && (
                <View style={styles.prRow}>
                  <View
                    style={[
                      styles.prPill,
                      { backgroundColor: Colors.teal + "15" },
                    ]}
                  >
                    <Text
                      style={{
                        color: Colors.teal,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      Top set: {toDisplay(maxWeight)} {unit}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { padding: 20, paddingBottom: 60 },
    date: { fontSize: 14, marginBottom: 4 },
    name: { fontSize: 24, fontWeight: "700", marginBottom: 20 },
    summaryRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
    summaryPill: {
      flex: 1,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
    },
    summaryValue: { fontSize: 20, fontWeight: "700" },
    summaryLabel: { fontSize: 11, fontWeight: "500", marginTop: 2 },
    heatmapCard: {
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
    },
    heatmapTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
    groupCard: {
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
    },
    groupHeader: { marginBottom: 10 },
    groupName: { fontSize: 17, fontWeight: "700" },
    groupMuscle: { fontSize: 12, marginTop: 2 },
    colHeaders: {
      flexDirection: "row",
      paddingHorizontal: 2,
      marginBottom: 4,
      gap: 8,
    },
    colHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    setNumBadge: {
      width: 36,
      height: 28,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    setNum: { fontSize: 13, fontWeight: "700" },
    setCell: { flex: 1, fontSize: 14 },
    prRow: { flexDirection: "row", marginTop: 10 },
    prPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  });
}
