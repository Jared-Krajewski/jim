import Colors from "@/constants/Colors";
import { MUSCLE_GROUPS } from "@/constants/MuscleGroups";
import {
  Exercise,
  createExercise,
  deleteExercise,
  getExercises,
  updateExercise,
} from "@/src/db/database";
import { useUnit } from "@/src/UnitContext";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColorScheme } from "@/components/useColorScheme";

function convertWeightDisplay(
  weight: number,
  storedUnit: string,
  displayUnit: string,
): string {
  if (weight <= 0) return "";
  if (storedUnit === displayUnit) return String(weight);
  if (storedUnit === "lbs" && displayUnit === "kg")
    return String(Math.round((weight / 2.20462) * 10) / 10);
  if (storedUnit === "kg" && displayUnit === "lbs")
    return String(Math.round(weight * 2.20462 * 10) / 10);
  return String(weight);
}

const ALL = "All";

export default function ExercisesScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const styles = makeStyles(theme);
  const { unit } = useUnit();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filter, setFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);

  // form state
  const [formName, setFormName] = useState("");
  const [formMuscle, setFormMuscle] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formDefaultWeight, setFormDefaultWeight] = useState("");
  const [formDefaultUnit, setFormDefaultUnit] = useState<"lbs" | "kg">("lbs");
  const [formDefaultReps, setFormDefaultReps] = useState("");

  const load = useCallback(() => {
    getExercises().then(setExercises).catch(console.error);
  }, []);

  useFocusEffect(load);

  const visible = exercises.filter((e) => {
    const matchFilter = filter === ALL || e.muscle_group === filter;
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  function openAdd() {
    setEditing(null);
    setFormName("");
    setFormMuscle(MUSCLE_GROUPS[0]);
    setFormNotes("");
    setFormDefaultWeight("");
    setFormDefaultUnit("lbs");
    setFormDefaultReps("");
    setModalVisible(true);
  }

  function openEdit(ex: Exercise) {
    setEditing(ex);
    setFormName(ex.name);
    setFormMuscle(ex.muscle_group);
    setFormNotes(ex.notes);
    setFormDefaultWeight(
      ex.default_weight > 0 ? String(ex.default_weight) : "",
    );
    setFormDefaultUnit((ex.default_unit as "lbs" | "kg") || "lbs");
    setFormDefaultReps(ex.default_reps > 0 ? String(ex.default_reps) : "");
    setModalVisible(true);
  }

  async function save() {
    const name = formName.trim();
    if (!name) return;
    const dw = parseFloat(formDefaultWeight) || 0;
    const dr = parseInt(formDefaultReps, 10) || 10;
    if (editing) {
      await updateExercise(
        editing.id,
        name,
        formMuscle,
        formNotes.trim(),
        dw,
        formDefaultUnit,
        dr,
      );
    } else {
      await createExercise(
        name,
        formMuscle,
        formNotes.trim(),
        dw,
        formDefaultUnit,
        dr,
      );
    }
    setModalVisible(false);
    load();
  }

  function confirmDelete(ex: Exercise) {
    Alert.alert(
      "Delete Exercise",
      `Delete "${ex.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteExercise(ex.id);
            load();
          },
        },
      ],
    );
  }

  const muscleFilters = [ALL, ...MUSCLE_GROUPS];

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.inputBg, borderColor: theme.border },
          ]}
        >
          <Ionicons name="search" size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search exercises…"
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {muscleFilters.map((mg) => (
          <TouchableOpacity
            key={mg}
            style={[
              styles.chip,
              {
                backgroundColor: filter === mg ? Colors.accent : theme.card,
                borderColor: filter === mg ? Colors.accent : theme.border,
              },
            ]}
            onPress={() => setFilter(mg)}
          >
            <Text
              style={[
                styles.chipText,
                { color: filter === mg ? "#fff" : theme.textSecondary },
              ]}
            >
              {mg}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <FlatList
        data={visible}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="barbell-outline"
              size={44}
              color={theme.textMuted}
            />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {exercises.length === 0
                ? "Add your first exercise!"
                : "No matches."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.cardLeft}>
              <Text style={[styles.cardName, { color: theme.text }]}>
                {item.name}
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: Colors.accent + "22" },
                ]}
              >
                <Text style={[styles.badgeText, { color: theme.badgeText }]}> 
                  {item.muscle_group || "Other"}
                </Text>
              </View>
              {item.notes ? (
                <Text
                  style={[styles.cardNotes, { color: theme.textMuted }]}
                  numberOfLines={1}
                >
                  {item.notes}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.defaultsBadge,
                { backgroundColor: Colors.accent + "22" },
              ]}
            >
              <Text
                style={[styles.defaultsBadgeText, { color: theme.badgeText }]}
              >
                {item.default_reps}r
                {item.default_weight > 0
                  ? ` · ${convertWeightDisplay(item.default_weight, item.default_unit, unit)}${unit}`
                  : ""}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => openEdit(item)}
              >
                <Ionicons name="pencil" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => confirmDelete(item)}
              >
                <Ionicons name="trash" size={18} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: Colors.accent }]}
        onPress={openAdd}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
        >
          {/* Drag indicator */}
          <View style={styles.dragHandle}>
            <View
              style={[
                styles.dragPill,
                { backgroundColor: theme.textMuted + "66" },
              ]}
            />
          </View>
          <View
            style={[styles.modalHeader, { borderBottomColor: theme.border }]}
          >
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: theme.textSecondary }]}> 
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editing ? "Edit Exercise" : "New Exercise"}
            </Text>
            <TouchableOpacity onPress={save}>
              <Text
                style={[
                  styles.modalSave,
                  { color: theme.textSecondary, opacity: formName.trim() ? 1 : 0.4 },
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              EXERCISE NAME *
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
              placeholder="e.g. Bench Press"
              placeholderTextColor={theme.textMuted}
              value={formName}
              onChangeText={setFormName}
              autoFocus
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>
              MUSCLE GROUP
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 20 }}
            >
              <View style={{ flexDirection: "row", gap: 8 }}>
                {MUSCLE_GROUPS.map((mg) => (
                  <TouchableOpacity
                    key={mg}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          formMuscle === mg ? Colors.accent : theme.inputBg,
                        borderColor:
                          formMuscle === mg ? Colors.accent : theme.border,
                      },
                    ]}
                    onPress={() => setFormMuscle(mg)}
                  >
                    <Text
                      style={{
                        color: formMuscle === mg ? "#fff" : theme.textSecondary,
                        fontSize: 13,
                      }}
                    >
                      {mg}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.label, { color: theme.textSecondary }]}>
              NOTES (optional)
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
              placeholder="Any tips, form cues, etc."
              placeholderTextColor={theme.textMuted}
              value={formNotes}
              onChangeText={setFormNotes}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>
              DEFAULT REPS
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
              placeholder="e.g. 10"
              placeholderTextColor={theme.textMuted}
              value={formDefaultReps}
              onChangeText={setFormDefaultReps}
              keyboardType="number-pad"
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>
              DEFAULT WEIGHT
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              <TextInput
                style={[
                  styles.input,
                  {
                    flex: 1,
                    marginBottom: 0,
                    backgroundColor: theme.inputBg,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="e.g. 135"
                placeholderTextColor={theme.textMuted}
                value={formDefaultWeight}
                onChangeText={setFormDefaultWeight}
                keyboardType="decimal-pad"
              />
              <View
                style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
              >
                {(["lbs", "kg"] as const).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[
                      styles.unitBtn,
                      {
                        backgroundColor:
                          formDefaultUnit === u ? Colors.accent : theme.inputBg,
                        borderColor:
                          formDefaultUnit === u ? Colors.accent : theme.border,
                      },
                    ]}
                    onPress={() => setFormDefaultUnit(u)}
                  >
                    <Text
                      style={{
                        color:
                          formDefaultUnit === u ? "#fff" : theme.textSecondary,
                        fontWeight: "600",
                        fontSize: 14,
                      }}
                    >
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    searchRow: { padding: 12, paddingBottom: 4 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: 15 },
    chipScroll: { maxHeight: 48, flexShrink: 0 },
    chipRow: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 8,
      flexDirection: "row",
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    chipText: { fontSize: 13, fontWeight: "500" },
    list: { padding: 12, paddingBottom: 100 },
    card: {
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
    },
    cardLeft: { flex: 1 },
    cardName: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      marginBottom: 2,
    },
    badgeText: { fontSize: 11, fontWeight: "600" },
    cardNotes: { fontSize: 13, marginTop: 2 },
    cardActions: { flexDirection: "row", gap: 8 },
    defaultsBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      marginRight: 8,
    },
    defaultsBadgeText: { fontSize: 12, fontWeight: "700" },
    iconBtn: { padding: 6 },
    empty: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 15 },
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
    // Modal
    modalContainer: { flex: 1 },
    dragHandle: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
    dragPill: { width: 36, height: 4, borderRadius: 2 },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 17, fontWeight: "600" },
    modalCancel: { fontSize: 16 },
    modalSave: { fontSize: 16, fontWeight: "600" },
    modalBody: { padding: 20 },
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
    textarea: { height: 80, textAlignVertical: "top" },
    unitBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
  });
}
