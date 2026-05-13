import Colors from "@/constants/Colors";
import { ExportPayload, exportAllData, importAllData } from "@/src/db/database";
import { useAppTheme } from "@/src/ThemeContext";
import { useUnit } from "@/src/UnitContext";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { Stack } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
} from "react-native";

// ── Drag handle ───────────────────────────────────────────────────────────────
function DragHandle({ theme }: { theme: (typeof Colors)["light"] }) {
  return (
    <View style={styles.dragHandle}>
      <View
        style={[styles.dragPill, { backgroundColor: theme.textMuted + "66" }]}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { colorScheme, setColorScheme } = useAppTheme();
  const { unit, setUnit } = useUnit();
  const theme = Colors[colorScheme];
  const isDark = colorScheme === "dark";
  const [busy, setBusy] = useState(false);

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport() {
    setBusy(true);
    try {
      const payload = await exportAllData();
      const json = JSON.stringify(payload, null, 2);
      const file = new File(Paths.cache, `jim-backup-${Date.now()}.json`);
      file.create();
      file.write(json);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/json",
          dialogTitle: "Export Jim data",
          UTI: "public.json",
        });
      } else {
        Alert.alert(
          "Sharing not available",
          "Cannot open share sheet on this device.",
        );
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Export failed", String(e));
    } finally {
      setBusy(false);
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  async function handleImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const text = await new File(uri).text();

      let payload: ExportPayload;
      try {
        payload = JSON.parse(text);
      } catch {
        Alert.alert("Invalid file", "The selected file is not valid JSON.");
        return;
      }

      if (!payload.version || !Array.isArray(payload.exercises)) {
        Alert.alert(
          "Invalid file",
          "This does not look like a Jim backup file.",
        );
        return;
      }

      Alert.alert(
        "Replace all data?",
        `This will delete everything and restore from backup:\n• ${payload.exercises.length} exercises\n• ${payload.templates.length} templates\n• ${payload.sessions.length} sessions\n\nThis cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Replace",
            style: "destructive",
            onPress: async () => {
              setBusy(true);
              try {
                await importAllData(payload);
                Alert.alert("Done", "Data restored successfully.");
              } catch (e) {
                console.error(e);
                Alert.alert("Import failed", String(e));
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
    } catch (e) {
      console.error(e);
      Alert.alert("Import failed", String(e));
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Settings", presentation: "modal" }} />
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <DragHandle theme={theme} />
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          >
            {/* Appearance section */}
            <Text style={[sectionTitle, { color: theme.textMuted }]}>
              APPEARANCE
            </Text>
            <View
              style={[
                styles.group,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <View style={[styles.row, { borderBottomWidth: 0 }]}>
                <Ionicons
                  name={isDark ? "moon" : "sunny"}
                  size={20}
                  color={Colors.accent}
                  style={styles.icon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    Dark Mode
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                    {isDark ? "On" : "Off"}
                  </Text>
                </View>
                <View
                  style={
                    !isDark
                      ? {
                          backgroundColor: Colors.accent,
                          borderRadius: 16,

                          padding: 2,
                        }
                      : undefined
                  }
                >
                  <Switch
                    value={isDark}
                    onValueChange={(val) =>
                      setColorScheme(val ? "dark" : "light")
                    }
                    trackColor={{ false: theme.border, true: Colors.accent }}
                    thumbColor={isDark ? "#e8d8c9" : "#FFFFFF"}
                  />
                </View>
              </View>
            </View>

            {/* Units section */}
            <Text style={[sectionTitle, { color: theme.textMuted }]}>
              UNITS
            </Text>
            <View
              style={[
                styles.group,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <View style={[styles.row, { borderBottomWidth: 0 }]}>
                <Ionicons
                  name="barbell-outline"
                  size={20}
                  color={Colors.accent}
                  style={styles.icon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    Weight Unit
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                    {unit === "lbs" ? "Pounds (lbs)" : "Kilograms (kg)"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["lbs", "kg"] as const).map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setUnit(u)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 8,
                        borderWidth: 1.5,
                        backgroundColor:
                          unit === u ? Colors.accent : theme.inputBg,
                        borderColor: unit === u ? Colors.accent : theme.border,
                      }}
                    >
                      <Text
                        style={{
                          color: unit === u ? "#fff" : theme.textSecondary,
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Data section */}
            <Text style={[sectionTitle, { color: theme.textMuted }]}>DATA</Text>

            <View
              style={[
                styles.group,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: theme.border }]}
                onPress={handleExport}
                disabled={busy}
              >
                <Ionicons
                  name="share-outline"
                  size={20}
                  color={Colors.accent}
                  style={styles.icon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    Export as JSON
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                    Save a backup of all exercises, templates and workouts
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.textMuted}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.row}
                onPress={handleImport}
                disabled={busy}
              >
                <Ionicons
                  name="cloud-download-outline"
                  size={20}
                  color={Colors.accent}
                  style={styles.icon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    Import from JSON
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                    Restore from a previous backup (replaces current data)
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>
          </ScrollView>
          {/* Privacy Policy fixed at bottom */}
          <View
            style={[
              styles.privacyContainer,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                // Open external privacy policy link
                try {
                  // Use Linking from react-native
                  const Linking = require("react-native").Linking;
                  Linking.openURL("https://www.jaredkrajewski.com/privacy/jim");
                } catch {}
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.privacyTitleLink, { color: Colors.accent }]}>
                Privacy Policy
              </Text>
            </TouchableOpacity>
            <Text style={[styles.privacyText, { color: theme.textMuted }]}>
              All data in Jim is stored locally on your device. No workout,
              exercise, or personal information is ever uploaded, shared, or
              transmitted to any server. Your privacy is fully protected, and
              you have complete control over your data at all times.
            </Text>
          </View>
        </View>
      </View>
    </>
  );
}

const sectionTitle: TextStyle = {
  fontSize: 12,
  fontWeight: "700",
  letterSpacing: 0.8,
  textTransform: "uppercase",
  marginBottom: 8,
};

const styles = StyleSheet.create({
  privacyContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // backgroundColor and borderColor moved to inline style for theme support
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  privacyTitleLink: {
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 4,
    // color moved to inline style for theme support
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  privacyText: {
    fontSize: 12,
    // color moved to inline style for theme support
    textAlign: "center",
    lineHeight: 17,
  },
  dragHandle: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  group: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  rowSub: { fontSize: 12 },
});
