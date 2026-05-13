import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import {
  WorkoutSession,
  WorkoutTemplate,
  deleteSession,
  deleteTemplate,
  getRecentSessions,
  getTemplates,
  reorderTemplates,
} from "@/src/db/database";
import { useActiveWorkout } from "@/src/WorkoutContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Tab = "templates" | "history";

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function WorkoutsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const styles = makeStyles(theme);
  const router = useRouter();
  const { activeWorkout } = useActiveWorkout();

  const [activeTab, setActiveTab] = useState<Tab>("templates");
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  // ── Drag-to-reorder state ──────────────────────────────────────────────────
  const draggingIdxRef = useRef(-1);
  const [draggingIdx, setDraggingIdx] = useState(-1);
  const hoverIdxRef = useRef(-1);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const dragYAnim = useRef(new Animated.Value(0)).current;
  const dragStartAbsY = useRef(0);
  // Layout y & height for each template card (indexed by position in `templates`)
  const itemLayouts = useRef<{ y: number; height: number }[]>([]);
  // Absolute Y of the template list container on screen
  const listContainerY = useRef(0);
  const isDraggingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => false,
      // Capture phase: steal touches from children when a drag is active
      onMoveShouldSetPanResponderCapture: () => isDraggingRef.current,
      onPanResponderGrant: (e) => {
        dragStartAbsY.current = e.nativeEvent.pageY;
        dragYAnim.setValue(0);
      },
      onPanResponderMove: (e) => {
        if (!isDraggingRef.current) return;
        const dy = e.nativeEvent.pageY - dragStartAbsY.current;
        dragYAnim.setValue(dy);

        // Determine which slot the dragged item is hovering over
        const draggedLayout = itemLayouts.current[draggingIdxRef.current];
        if (!draggedLayout) return;
        const centerY = draggedLayout.y + draggedLayout.height / 2 + dy;

        let closestIdx = draggingIdxRef.current;
        let closestDist = Infinity;
        itemLayouts.current.forEach((lay, i) => {
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
          setTemplates((prev) => {
            const next = [...prev];
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            reorderTemplates(next.map((t) => t.id)).catch(console.error);
            return next;
          });
        }
        // Reset drag state
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

  const load = useCallback(() => {
    getTemplates().then(setTemplates).catch(console.error);
    getRecentSessions(30).then(setSessions).catch(console.error);
  }, []);

  useFocusEffect(load);

  function confirmDeleteTemplate(t: WorkoutTemplate) {
    Alert.alert("Delete Template", `Delete "${t.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTemplate(t.id);
          load();
        },
      },
    ]);
  }

  function confirmDeleteSession(s: WorkoutSession) {
    Alert.alert(
      "Delete Session",
      `Delete this workout from ${formatDate(s.date)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteSession(s.id);
            load();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      {/* In Progress banner */}
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
            <Ionicons name="barbell" size={18} color={theme.tint} />
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.inProgressLabel, { color: theme.tint }]}>
                IN PROGRESS
              </Text>
              <Text
                style={[styles.inProgressName, { color: theme.text }]}
                numberOfLines={1}
              >
                {activeWorkout.sessionName}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.tint} />
        </TouchableOpacity>
      )}

      {/* Segment control */}
      <View
        style={[
          styles.segmentRow,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {(["templates", "history"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[
              styles.segBtn,
              activeTab === t && { backgroundColor: Colors.accent },
            ]}
            onPress={() => setActiveTab(t)}
          >
            <Text
              style={[
                styles.segText,
                { color: activeTab === t ? "#fff" : theme.textSecondary },
              ]}
            >
              {t === "templates" ? "Templates" : "History"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "templates" ? (
        /* ── Draggable template list ──────────────────────────────────────── */
        <View
          style={{ flex: 1 }}
          {...panResponder.panHandlers}
          onLayout={(e) => {
            listContainerY.current = e.nativeEvent.layout.y;
          }}
        >
          <ScrollView
            contentContainerStyle={styles.list}
            scrollEnabled={!isDraggingRef.current}
          >
            {/* Ad-hoc quick-start card */}
            <TouchableOpacity
              style={[
                styles.adhocCard,
                {
                  borderColor: activeWorkout ? theme.border : theme.tint,
                  opacity: activeWorkout ? 0.5 : 1,
                },
              ]}
              onPress={() => !activeWorkout && router.push("/log/adhoc")}
              disabled={!!activeWorkout}
            >
              <Ionicons
                name="flash"
                size={20}
                color={activeWorkout ? theme.textMuted : theme.tint}
              />
              <Text
                style={[
                  styles.adhocText,
                  { color: activeWorkout ? theme.textMuted : theme.tint },
                ]}
              >
                Quick (Ad-hoc) Workout
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={activeWorkout ? theme.textMuted : theme.tint}
              />
            </TouchableOpacity>

            {templates.length === 0 && (
              <View style={styles.empty}>
                <Ionicons
                  name="clipboard-outline"
                  size={44}
                  color={theme.textMuted}
                />
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  No templates yet.{"\n"}Create one to plan your workouts!
                </Text>
              </View>
            )}

            {templates.map((item, idx) => {
              const isDragging = draggingIdx === idx;
              const isHover = hoverIdx === idx && !isDragging;
              return (
                <Animated.View
                  key={item.id}
                  onLayout={(e) => {
                    itemLayouts.current[idx] = {
                      y: e.nativeEvent.layout.y,
                      height: e.nativeEvent.layout.height,
                    };
                  }}
                  style={[
                    styles.templateCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: isHover ? theme.tint : theme.border,
                      borderWidth: isHover ? 2 : 1,
                      opacity: isDragging ? 0.6 : 1,
                    },
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
                  <View style={styles.templateTop}>
                    {/* Drag handle */}
                    <TouchableOpacity
                      style={styles.dragHandle}
                      onLongPress={() => {
                        draggingIdxRef.current = idx;
                        hoverIdxRef.current = idx;
                        isDraggingRef.current = true;
                        dragYAnim.setValue(0);
                        setDraggingIdx(idx);
                        setHoverIdx(idx);
                        Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Medium,
                        ).catch(() => {});
                      }}
                      delayLongPress={200}
                      activeOpacity={0.6}
                    >
                      <Ionicons
                        name="reorder-three"
                        size={22}
                        color={isDragging ? theme.tint : theme.textMuted}
                      />
                    </TouchableOpacity>

                    <Text style={[styles.templateName, { color: theme.text }]}>
                      {item.name}
                    </Text>
                    <View style={styles.templateActions}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => router.push(`/workout/${item.id}`)}
                      >
                        <Ionicons
                          name="pencil"
                          size={17}
                          color={theme.textSecondary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => confirmDeleteTemplate(item)}
                      >
                        <Ionicons
                          name="trash"
                          size={17}
                          color={Colors.danger}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {item.notes ? (
                    <Text
                      style={[styles.templateNotes, { color: theme.textMuted }]}
                      numberOfLines={1}
                    >
                      {item.notes}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={[
                      styles.startBtn,
                      {
                        backgroundColor: activeWorkout
                          ? theme.border
                          : Colors.accent,
                        opacity: activeWorkout ? 0.7 : 1,
                      },
                    ]}
                    onPress={() =>
                      !activeWorkout && router.push(`/log/${item.id}`)
                    }
                    disabled={!!activeWorkout}
                  >
                    <Ionicons
                      name="play"
                      size={15}
                      color={activeWorkout ? theme.textMuted : "#fff"}
                    />
                    <Text
                      style={[
                        styles.startBtnText,
                        { color: activeWorkout ? theme.textMuted : "#fff" },
                      ]}
                    >
                      {activeWorkout
                        ? "Finish Current Workout First"
                        : "Start Workout"}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="calendar-outline"
                size={44}
                color={theme.textMuted}
              />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No completed workouts yet.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.historyCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={() => router.push(`/session/${item.id}`)}
            >
              <View style={styles.historyLeft}>
                <Text style={[styles.historyName, { color: theme.text }]}>
                  {item.name}
                </Text>
                <Text
                  style={[styles.historyDate, { color: theme.textSecondary }]}
                >
                  {formatDate(item.date)}
                </Text>
              </View>
              <View style={styles.historyRight}>
                <TouchableOpacity onPress={() => confirmDeleteSession(item)}>
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={Colors.danger}
                  />
                </TouchableOpacity>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.textMuted}
                />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB — only on templates tab */}
      {activeTab === "templates" && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: Colors.accent }]}
          onPress={() => router.push("/workout/new")}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    segmentRow: {
      flexDirection: "row",
      margin: 12,
      borderRadius: 12,
      padding: 3,
      borderWidth: 1,
    },
    segBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      alignItems: "center",
    },
    segText: { fontSize: 14, fontWeight: "600" },
    list: { padding: 12, paddingBottom: 100 },
    adhocCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1.5,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderStyle: "dashed",
    },
    adhocText: { flex: 1, fontSize: 15, fontWeight: "600" },
    templateCard: {
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
    },
    templateTop: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    dragHandle: {
      paddingRight: 8,
      paddingVertical: 4,
      justifyContent: "center",
    },
    templateName: { flex: 1, fontSize: 17, fontWeight: "700" },
    templateActions: { flexDirection: "row", gap: 4 },
    iconBtn: { padding: 6 },
    templateNotes: { fontSize: 13, marginBottom: 12 },
    startBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 10,
      paddingVertical: 10,
      marginTop: 8,
    },
    startBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
    historyCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
    },
    historyLeft: { flex: 1 },
    historyName: { fontSize: 15, fontWeight: "600" },
    historyDate: { fontSize: 13, marginTop: 2 },
    historyRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    empty: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 15, textAlign: "center", lineHeight: 22 },
    fab: {
      position: "absolute",
      bottom: 28,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
    inProgressCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1.5,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      margin: 12,
      marginBottom: 0,
    },
    inProgressLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    inProgressLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    inProgressName: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  });
}
