import Colors from "@/constants/Colors";
import { CalendarDay, getRecentSessions, getWorkoutCalendarDates, WorkoutSession } from "@/src/db/database";
import { useActiveWorkout } from "@/src/WorkoutContext";
import { useColorScheme } from "@/components/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Activity Heatmap (GitHub contribution-style) ────────────────────────────

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;
const DAYS_OF_WEEK = ["S", "M", "T", "W", "T", "F", "S"];

function cellColor(count: number, isDark: boolean): string {
  if (count === 0) return isDark ? "#2a2a2a" : "#e8e8e8";
  if (count === 1) return "#1e6823";
  if (count === 2) return "#26a641";
  return "#39d353";
}

interface HeatmapProps {
  data: CalendarDay[];
  colorScheme: "light" | "dark";
  theme: (typeof Colors)["light"];
}

function ActivityHeatmap({ data, colorScheme, theme }: HeatmapProps) {
  const isDark = colorScheme === "dark";
  const scrollRef = useRef<ScrollView>(null);

  // Build a date→count map
  const counts = new Map<string, number>();
  data.forEach((d) => counts.set(d.date, d.count));

  const todayISO = new Date().toISOString().split("T")[0];

  // Generate the last 52 complete weeks + partial current week
  // Start on the Sunday 364 days ago
  const start = new Date();
  start.setDate(start.getDate() - 364);
  // Rewind to the most recent Sunday
  start.setDate(start.getDate() - start.getDay());

  const weeks: string[][] = [];
  const cur = new Date(start);
  while (cur.toISOString().split("T")[0] <= todayISO) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  // Month labels: track when each month first appears
  const monthLabels: { weekIdx: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const m = new Date(week[0]).getMonth();
    if (m !== lastMonth) {
      monthLabels.push({
        weekIdx: wi,
        label: new Date(week[0]).toLocaleString("default", { month: "short" }),
      });
      lastMonth = m;
    }
  });

  const totalWidth = weeks.length * STEP;

  return (
    <View style={{ marginBottom: 4 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 20, paddingRight: 8 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <View>
          {/* Month labels */}
          <View style={{ height: 16, position: "relative", width: totalWidth }}>
            {monthLabels.map(({ weekIdx, label }) => (
              <Text
                key={`${weekIdx}-${label}`}
                style={{
                  position: "absolute",
                  left: weekIdx * STEP,
                  fontSize: 9,
                  color: theme.textMuted,
                  fontWeight: "500",
                }}
              >
                {label}
              </Text>
            ))}
          </View>
          {/* Day grid */}
          <View style={{ flexDirection: "row", gap: GAP }}>
            <View style={{ gap: GAP, marginRight: 2 }}>
              {DAYS_OF_WEEK.map((d, i) => (
                <View
                  key={i}
                  style={{
                    width: 8,
                    height: CELL,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i % 2 === 1 && (
                    <Text
                      style={{ fontSize: 7, color: theme.textMuted, fontWeight: "500" }}
                    >
                      {d}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            {/* Cells */}
            {weeks.map((week, wi) => (
              <View key={wi} style={{ gap: GAP }}>
                {week.map((dateStr) => {
                  const count = counts.get(dateStr) ?? 0;
                  const isFuture = dateStr > todayISO;
                  return (
                    <View
                      key={dateStr}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2,
                        backgroundColor: isFuture
                          ? "transparent"
                          : cellColor(count, isDark),
                      }}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function daysBetween(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const msPerDay = 86400000;
  const diff = Math.floor(
    (now.setHours(0, 0, 0, 0) - then.setHours(0, 0, 0, 0)) / msPerDay,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const router = useRouter();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const { activeWorkout } = useActiveWorkout();

  useFocusEffect(
    useCallback(() => {
      getRecentSessions(6).then(setSessions).catch(console.error);
      getWorkoutCalendarDates(365).then(setCalendarDays).catch(console.error);
    }, []),
  );

  const todayISO = new Date().toISOString().split("T")[0];

  const styles = makeStyles(theme);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.date}>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/settings" as any)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name="settings-outline"
            size={24}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Start</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[
            styles.actionCard,
            {
              backgroundColor: activeWorkout ? theme.card : Colors.accent,
              borderWidth: activeWorkout ? 1 : 0,
              borderColor: theme.border,
              opacity: activeWorkout ? 0.5 : 1,
            },
          ]}
          onPress={() => !activeWorkout && router.push("/(tabs)/workouts")}
          activeOpacity={activeWorkout ? 1 : 0.7}
        >
          <Ionicons
            name="barbell"
            size={28}
            color={activeWorkout ? theme.textMuted : "#fff"}
          />
          <Text
            style={[
              styles.actionCardText,
              { color: activeWorkout ? theme.textMuted : "#fff" },
            ]}
          >
            Start Workout
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionCard,
            {
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: theme.border,
            },
          ]}
          onPress={() => router.push("/(tabs)/timer")}
        >
          <Ionicons name="timer" size={28} color={theme.tint} />
          <Text style={[styles.actionCardText, { color: theme.text }]}>
            Rest Timer
          </Text>
        </TouchableOpacity>
      </View>

      {/* In Progress banner — sits inside Quick Start below the action cards */}
      {activeWorkout && (
        <TouchableOpacity
          style={[
            styles.inProgressCard,
            {
              backgroundColor: Colors.accent + "18",
              borderColor: Colors.accent,
            },
          ]}
          onPress={() =>
            router.push(
              `/log/adhoc?sessionId=${activeWorkout.sessionId}` as any,
            )
          }
        >
          <View style={styles.inProgressLeft}>
            <Ionicons name="barbell" size={20} color={theme.tint} />
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.inProgressTitle, { color: theme.tint }]}>
                In Progress
              </Text>
              <Text
                style={[styles.inProgressName, { color: theme.text }]}
                numberOfLines={1}
              >
                {activeWorkout.sessionName}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.tint} />
        </TouchableOpacity>
      )}

      {/* Activity Heatmap */}
      <Text style={styles.sectionTitle}>Activity</Text>
      <View
        style={[
          styles.heatmapCard,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <ActivityHeatmap
          data={calendarDays}
          colorScheme={colorScheme ?? "light"}
          theme={theme}
        />
      </View>

      {/* Recent Sessions */}
      <Text style={styles.sectionTitle}>Recent Workouts</Text>
      {sessions.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Ionicons name="barbell-outline" size={40} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            No workouts yet. Log a workout to see it here.
          </Text>
        </View>
      ) : (
        sessions.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[
              styles.sessionCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => router.push(`/session/${s.id}`)}
          >
            <View style={styles.sessionLeft}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      s.date === todayISO ? Colors.accent : theme.border,
                  },
                ]}
              />
              <View>
                <Text style={[styles.sessionName, { color: theme.text }]}>
                  {s.name}
                </Text>
                <Text
                  style={[styles.sessionDate, { color: theme.textSecondary }]}
                >
                  {formatDate(s.date)} · {daysBetween(s.date)}
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.textMuted}
            />
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { padding: 20, paddingBottom: 40 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 28,
      marginTop: 8,
    },
    greeting: { fontSize: 26, fontWeight: "700", color: theme.text },
    date: { fontSize: 14, color: theme.textSecondary, marginTop: 2 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: theme.textMuted,
      marginBottom: 10,
      marginTop: 4,
    },
    row: { flexDirection: "row", gap: 12, marginBottom: 12 },
    actionCard: {
      flex: 1,
      borderRadius: 14,
      padding: 18,
      alignItems: "center",
      gap: 8,
    },
    actionCardText: { fontSize: 14, fontWeight: "600", color: "#fff" },
    heatmapCard: {
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 0,
      marginBottom: 20,
      borderWidth: 1,
      overflow: "hidden",
    },
    emptyCard: {
      borderRadius: 14,
      padding: 32,
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
    },
    emptyText: { fontSize: 14, textAlign: "center" },
    sessionCard: {
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
    },
    sessionLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    dot: { width: 10, height: 10, borderRadius: 5 },
    sessionName: { fontSize: 15, fontWeight: "600" },
    sessionDate: { fontSize: 13, marginTop: 2 },
    inProgressCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1.5,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 20,
    },
    inProgressLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    inProgressTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
    inProgressName: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  });
}
