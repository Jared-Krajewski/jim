import Colors from "@/constants/Colors";
import { createTemplate } from "@/src/db/database";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColorScheme } from "@/components/useColorScheme";

export default function NewTemplateScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const styles = makeStyles(theme);
  const router = useRouter();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Please give this template a name.");
      return;
    }
    setSaving(true);
    try {
      const id = await createTemplate(trimmed, notes.trim());
      // Go directly to edit screen so user can add exercises
      router.replace(`/workout/${id}`);
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Drag indicator */}
      <View style={styles.dragHandle}>
        <View style={[styles.dragPill, { backgroundColor: "#78788066" }]} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          TEMPLATE NAME *
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
          placeholder="e.g. Push Day A"
          placeholderTextColor={theme.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
        />

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
          placeholder="Any notes about this workout…"
          placeholderTextColor={theme.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[
            styles.createBtn,
            { backgroundColor: Colors.accent, opacity: saving ? 0.6 : 1 },
          ]}
          onPress={handleCreate}
          disabled={saving}
        >
          <Text style={styles.createBtnText}>Create &amp; Add Exercises →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: (typeof Colors)["light"]) {
  return StyleSheet.create({
    container: { flex: 1 },
    dragHandle: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
    dragPill: { width: 36, height: 4, borderRadius: 2 },
    body: { padding: 20 },
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
    textarea: { height: 90, textAlignVertical: "top" },
    createBtn: {
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 8,
    },
    createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  });
}
