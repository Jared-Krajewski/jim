import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import { createTemplate } from "@/src/db/database";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

/**
 * Immediately creates an empty template and jumps straight to the
 * exercise-editor screen (isNew=1 so the bottom button says "Create Template").
 */
export default function NewTemplateScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const router = useRouter();

  useEffect(() => {
    createTemplate("", "")
      .then((id) => {
        router.replace(`/workout/${id}?isNew=1` as any);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.background,
      }}
    >
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}
