import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import {
  Exercise,
  TemplateExercise,
  WorkoutTemplate,
  addExerciseToTemplate,
  getExercises,
  getTemplate,
  getTemplateExercises,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
  updateTemplate,
  updateTemplateExercise,
} from "@/src/db/database";
import { useActiveWorkout } from "@/src/WorkoutContext";
import { useUnit } from "@/src/UnitContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function EditTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const templateId = Number(id);
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const styles = makeStyles(theme);
  const navigation = useNavigation();
  const router = useRouter();
  const { activeWorkout } = useActiveWorkout();
  const { unit } = useUnit();

  // Convert a stored weight to the global display unit
  function displayWeight(weight: number, storedUnit: string): string {
    if (weight <= 0) return "";
    if (storedUnit === unit) return `${weight}${unit}`;
    if (storedUnit === "lbs" && unit === "kg")
      return `${Math.round((weight / 2.20462) * 10) / 10}kg`;
    return `${Math.round(weight * 2.20462 * 10) / 10}lbs`;
  }

  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [templateExercises, setTemplateExercises] = useState<
    TemplateExercise[]
  >([]);
  const [templateName, setTemplateName] = useState("");
  const [templateNotes, setTemplateNotes] = useState("");

  // Exercise picker modal
  const [pickerVisible, setPickerVisible] = useState(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");

  // Sets/reps edit modal
  const [editingTE, setEditingTE] = useState<TemplateExercise | null>(null);
  const [editSets, setEditSets] = useState("3");
  const [editReps, setEditReps] = useState("10");
  const [editWeight, setEditWeight] = useState("0");
  const [editUnit, setEditUnit] = useState<"lbs" | "kg">("lbs");

  // Drag-to-reorder state
  const teRef = React.useRef<TemplateExercise[]>([]);
  React.useEffect(() => {
    teRef.current = templateExercises;
  }, [templateExercises]);

  const draggingIdxRef = React.useRef(-1);
  const [draggingIdx, setDraggingIdx] = useState(-1);
  const hoverIdxRef = React.useRef(-1);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const dragYAnim = React.useRef(new Animated.Value(0)).current;
  const dragStartAbsY = React.useRef(0);
  const itemRefs = React.useRef<(View | null)[]>([]);
  const itemAbsoluteY = React.useRef<{ y: number; height: number }[]>([]);
  const isDraggingRef = React.useRef(false);

  function startDrag(idx: number, pageY: number) {
    teRef.current.forEach((_, i) => {
      (itemRefs.current[i] as View | null)?.measure?.(
        (_fx, _fy, _w, h, _px, py) => {
          itemAbsoluteY.current[i] = { y: py, height: h };
        },
      );
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

  const panResponder = React.useRef(
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
          const next = [...teRef.current];
          const [item] = next.splice(from, 1);
          next.splice(to, 0, item);
          setTemplateExercises(next);
          reorderTemplateExercises(next.map((te) => te.id)).catch(
            console.error,
          );
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

  const load = useCallback(async () => {
    const t = await getTemplate(templateId);
    if (t) {
      setTemplate(t);
      setTemplateName(t.name);
      setTemplateNotes(t.notes);
      navigation.setOptions({ title: t.name });
    }
    const exs = await getTemplateExercises(templateId);
    setTemplateExercises(exs);
  }, [templateId]);

  // We use a small trick — useCallback with empty deps so it runs once on mount
  React.useEffect(() => {
    load();
  }, [load]);

  async function saveHeader() {
    const trimmed = templateName.trim();
    if (!trimmed) return;
    await updateTemplate(templateId, trimmed, templateNotes.trim());
    navigation.setOptions({ title: trimmed });
  }

  async function openPicker() {
    const exs = await getExercises();
    const existingIds = new Set(templateExercises.map((te) => te.exercise_id));
    setAllExercises(exs.filter((e) => !existingIds.has(e.id)));
    setPickerSearch("");
    setPickerVisible(true);
  }

  async function addExercise(exercise: Exercise) {
    await addExerciseToTemplate(
      templateId,
      exercise.id,
      3,
      exercise.default_reps ?? 10,
      templateExercises.length,
      exercise.default_weight ?? 0,
      (exercise.default_unit as "lbs" | "kg") ?? "lbs",
    );
    setPickerVisible(false);
    await load();
  }

  async function removeExercise(te: TemplateExercise) {
    Alert.alert(
      "Remove Exercise",
      `Remove "${te.exercise_name}" from this template?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeExerciseFromTemplate(te.id);
            await load();
          },
        },
      ],
    );
  }

  function openEditTE(te: TemplateExercise) {
    setEditingTE(te);
    setEditSets(String(te.default_sets));
    setEditReps(String(te.default_reps));
    const storedUnit = (te.default_unit as "lbs" | "kg") || "lbs";
    let w = te.default_weight;
    if (te.default_weight > 0 && storedUnit !== unit) {
      w = storedUnit === "lbs" && unit === "kg"
        ? Math.round((w / 2.20462) * 10) / 10
        : Math.round(w * 2.20462 * 10) / 10;
    }
    setEditWeight(te.default_weight > 0 ? String(w) : "0");
    setEditUnit(unit);
  }

  async function saveEditTE() {
    if (!editingTE) return;
    await updateTemplateExercise(
      editingTE.id,
      Number(editSets) || 1,
      Number(editReps) || 1,
      parseFloat(editWeight) || 0,
      editUnit,
    );
    setEditingTE(null);
    await load();
  }

  const filteredPicker = allExercises.filter((e) =>
    e.name.toLowerCase().includes(pickerSearch.toLowerCase()),
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* panHandlers must wrap OUTSIDE ScrollView for capture to work */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <ScrollView
          contentContainerStyle={styles.body}
          scrollEnabled={draggingIdx === -1}
        >
          {/* Header fields */}
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            TEMPLATE NAME
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            value={templateName}
            onChangeText={setTemplateName}
            onBlur={saveHeader}
            returnKeyType="done"
            onSubmitEditing={saveHeader}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>
            NOTES
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.textarea,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            value={templateNotes}
            onChangeText={setTemplateNotes}
            onBlur={saveHeader}
            multiline
            numberOfLines={2}
            placeholder="Optional notes…"
            placeholderTextColor={theme.textMuted}
          />

          {/* Exercises */}
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            EXERCISES
          </Text>
          {templateExercises.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No exercises yet. Tap + to add some.
              </Text>
            </View>
          ) : (
            <View>
              {templateExercises.map((te, idx) => {
                const isDragging = draggingIdx === idx;
                const hoverIndicator: "top" | "bottom" | null =
                  !isDragging && hoverIdx === idx
                    ? draggingIdx > idx
                      ? "top"
                      : "bottom"
                    : null;
                return (
                  <View
                    key={te.id}
                    ref={(r) => {
                      itemRefs.current[idx] = r;
                    }}
                  >
                    <Animated.View
                      style={[
                        isDragging && {
                          transform: [{ translateY: dragYAnim }],
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.2,
                          shadowRadius: 8,
                          elevation: 8,
                          zIndex: 999,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.exCard,
                          {
                            backgroundColor: hoverIndicator
                              ? Colors.accent + "12"
                              : theme.card,
                            borderColor: theme.border,
                            borderTopColor:
                              hoverIndicator === "top"
                                ? Colors.accent
                                : theme.border,
                            borderTopWidth: hoverIndicator === "top" ? 3 : 1,
                            borderBottomColor:
                              hoverIndicator === "bottom"
                                ? Colors.accent
                                : theme.border,
                            borderBottomWidth:
                              hoverIndicator === "bottom" ? 3 : 1,
                            shadowColor: hoverIndicator
                              ? Colors.accent
                              : undefined,
                            shadowOpacity: hoverIndicator ? 0.35 : 0,
                            shadowRadius: hoverIndicator ? 6 : 0,
                            shadowOffset: hoverIndicator
                              ? {
                                  width: 0,
                                  height:
                                    hoverIndicator === "top" ? -3 : 3,
                                }
                              : { width: 0, height: 0 },
                            opacity: isDragging ? 0.6 : 1,
                          },
                        ]}
                      >
                        {/* Drag handle */}
                        <TouchableOpacity
                          onLongPress={(event) =>
                            startDrag(idx, event.nativeEvent.pageY)
                          }
                          delayLongPress={200}
                          activeOpacity={0.6}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          style={{ paddingRight: 8 }}
                        >
                          <Ionicons
                            name="reorder-three"
                            size={22}
                            color={isDragging ? Colors.accent : theme.textMuted}
                          />
                        </TouchableOpacity>
                        <View style={styles.exInfo}>
                          <Text style={[styles.exName, { color: theme.text }]}>
                            {te.exercise_name}
                          </Text>
                          <Text
                            style={[
                              styles.exMeta,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {te.muscle_group}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.setsBadge,
                            { backgroundColor: Colors.accent + "22" },
                          ]}
                          onPress={() => openEditTE(te)}
                        >
                          <Text
                            style={[
                              styles.setsBadgeText,
                              { color: theme.badgeText },
                            ]}
                          >
                            {te.default_sets}×{te.default_reps}
                            {te.default_weight > 0
                              ? ` · ${displayWeight(te.default_weight, te.default_unit)}`
                              : ""}
                          </Text>
                          <Ionicons
                            name="pencil"
                            size={11}
                            color={theme.tint}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => removeExercise(te)}
                        >
                          <Ionicons
                            name="close-circle"
                            size={22}
                            color={Colors.danger}
                          />
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            style={[styles.addExBtn, { borderColor: theme.tint }]}
            onPress={openPicker}
          >
            <Ionicons name="add-circle" size={20} color={theme.tint} />
            <Text style={[styles.addExText, { color: theme.tint }]}>
              Add Exercise
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.startBtn,
              {
                backgroundColor: activeWorkout ? theme.border : Colors.accent,
                opacity: activeWorkout ? 0.7 : 1,
              },
            ]}
            onPress={() => !activeWorkout && router.push(`/log/${templateId}`)}
            disabled={!!activeWorkout}
          >
            <Ionicons
              name="play"
              size={16}
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
                : "Start This Workout"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sets/Reps edit modal */}
      <Modal visible={!!editingTE} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setEditingTE(null)}
        >
          <View style={[styles.setsModal, { backgroundColor: theme.card }]}>
            <Text style={[styles.setsModalTitle, { color: theme.text }]}>
              Sets, Reps &amp; Weight
            </Text>
            <Text style={[styles.setsModalSub, { color: theme.textSecondary }]}>
              {editingTE?.exercise_name}
            </Text>
            <View style={styles.setsRow}>
              <View style={styles.setsField}>
                <Text
                  style={[styles.setsLabel, { color: theme.textSecondary }]}
                >
                  Sets
                </Text>
                <TextInput
                  style={[
                    styles.setsInput,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.inputBg,
                    },
                  ]}
                  value={editSets}
                  onChangeText={setEditSets}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
              <Text style={[styles.cross, { color: theme.textMuted }]}>×</Text>
              <View style={styles.setsField}>
                <Text
                  style={[styles.setsLabel, { color: theme.textSecondary }]}
                >
                  Reps
                </Text>
                <TextInput
                  style={[
                    styles.setsInput,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.inputBg,
                    },
                  ]}
                  value={editReps}
                  onChangeText={setEditReps}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
            </View>
            <View style={[styles.setsRow, { marginTop: 12 }]}>
              <View style={[styles.setsField, { flex: 2 }]}>
                <Text
                  style={[styles.setsLabel, { color: theme.textSecondary }]}
                >
                  Weight
                </Text>
                <TextInput
                  style={[
                    styles.setsInput,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.inputBg,
                    },
                  ]}
                  value={editWeight}
                  onChangeText={setEditWeight}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "flex-end",
                  paddingBottom: 2,
                }}
              >
                {(["lbs", "kg"] as const).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[
                      styles.unitBtn,
                      {
                        backgroundColor:
                          editUnit === u ? Colors.accent : theme.inputBg,
                        borderColor:
                          editUnit === u ? Colors.accent : theme.border,
                      },
                    ]}
                    onPress={() => setEditUnit(u)}
                  >
                    <Text
                      style={{
                        color: editUnit === u ? "#fff" : theme.textSecondary,
                        fontWeight: "600",
                        fontSize: 13,
                      }}
                    >
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: Colors.accent }]}
              onPress={saveEditTE}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Exercise picker modal */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View
          style={[
            styles.pickerContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <View style={styles.dragHandle}>
            <View style={[styles.dragPill, { backgroundColor: "#78788066" }]} />
          </View>
          <View
            style={[styles.pickerHeader, { borderBottomColor: theme.border }]}
          >
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Text style={[styles.pickerCancel, { color: theme.tint }]}>
                Done
              </Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>
              Add Exercise
            </Text>
            <View style={{ width: 50 }} />
          </View>
          <View
            style={[
              styles.pickerSearch,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
            ]}
          >
            <Ionicons name="search" size={16} color={theme.textMuted} />
            <TextInput
              style={[styles.pickerSearchInput, { color: theme.text }]}
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
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <Text style={{ color: theme.textMuted }}>
                  {allExercises.length === 0
                    ? "No exercises. Add some first!"
                    : "No matches."}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.pickerItem, { borderBottomColor: theme.border }]}
                onPress={() => addExercise(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerItemName, { color: theme.text }]}>
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.pickerItemMuscle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {item.muscle_group}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.pickerItemDefaults,
                    { color: theme.textMuted },
                  ]}
                >
                  {item.default_reps}r
                  {item.default_weight > 0
                    ? `\n${displayWeight(item.default_weight, item.default_unit)}`
                    : ""}
                </Text>
                <Ionicons name="add-circle" size={22} color={theme.tint} />
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 20, paddingBottom: 60 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      marginBottom: 20,
    },
    textarea: { height: 70, textAlignVertical: "top" },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 10,
    },
    muscleHeader: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginTop: 10,
      marginBottom: 6,
    },
    emptyCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: "dashed",
      padding: 20,
      alignItems: "center",
      marginBottom: 12,
    },
    emptyText: { fontSize: 14 },
    exCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
    },
    exInfo: { flex: 1 },
    exName: { fontSize: 15, fontWeight: "600" },
    exMeta: { fontSize: 12, marginTop: 2 },
    setsBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      marginRight: 6,
    },
    setsBadgeText: { fontSize: 13, fontWeight: "700" },
    removeBtn: { padding: 4 },
    addExBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderRadius: 12,
      paddingVertical: 13,
      marginTop: 4,
      marginBottom: 16,
    },
    addExText: { fontSize: 15, fontWeight: "600" },
    startBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 12,
      paddingVertical: 14,
    },
    startBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    // Sets/reps modal
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    setsModal: {
      width: 280,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
    },
    setsModalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
    setsModalSub: { fontSize: 14, marginBottom: 20 },
    setsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
    },
    setsField: { alignItems: "center" },
    setsLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
    setsInput: {
      width: 72,
      textAlign: "center",
      fontSize: 22,
      fontWeight: "700",
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
    },
    cross: { fontSize: 22, fontWeight: "700", marginTop: 18 },
    saveBtn: { borderRadius: 10, paddingHorizontal: 32, paddingVertical: 11 },
    saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    unitBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
    },
    // Picker modal
    dragHandle: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
    dragPill: { width: 36, height: 4, borderRadius: 2 },
    pickerContainer: { flex: 1 },
    pickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderBottomWidth: 1,
    },
    pickerTitle: { fontSize: 17, fontWeight: "600" },
    pickerCancel: { fontSize: 16 },
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
    pickerSearchInput: { flex: 1, fontSize: 15 },
    pickerItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    pickerItemName: { fontSize: 16, fontWeight: "500" },
    pickerItemMuscle: { fontSize: 13, marginTop: 2 },
    pickerItemDefaults: {
      fontSize: 11,
      textAlign: "right",
      marginRight: 10,
      lineHeight: 16,
    },
  });
}
