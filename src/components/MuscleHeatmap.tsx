/**
 * MuscleHeatmap
 *
 * Renders a front + back body SVG with muscles highlighted proportionally to
 * training volume using react-native-body-highlighter.
 *
 * Props:
 *   muscleVolumes  — array of { muscle_group, total_volume } from the DB
 *   colorScheme    — "light" | "dark"
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
import Body, { Slug } from "react-native-body-highlighter";

const MUSCLE_SLUG_MAP: Record<string, Slug[]> = {
  Chest: ["chest"],
  Back: ["upper-back", "lower-back", "trapezius"],
  Shoulders: ["deltoids"],
  Biceps: ["biceps"],
  Triceps: ["triceps"],
  Forearms: ["forearm"],
  "Core / Abs": ["abs", "obliques"],
  Glutes: ["gluteal"],
  Quads: ["quadriceps"],
  Hamstrings: ["hamstring"],
  Calves: ["calves"],
  "Full Body": [
    "chest",
    "biceps",
    "abs",
    "quadriceps",
    "deltoids",
    "triceps",
    "upper-back",
    "lower-back",
    "hamstring",
    "gluteal",
    "calves",
  ],
};

// Heatmap gradient: 4 levels, low → high volume
const HEATMAP_COLORS = ["#c6e9c1", "#74c476", "#31a354", "#006d2c"];

interface Props {
  muscleVolumes: { muscle_group: string; total_volume: number }[];
}

export default function MuscleHeatmap({ muscleVolumes }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // Build slug → intensity map based on relative volume
  const bodyData = useMemo(() => {
    if (!muscleVolumes.length) return [];

    const filtered = muscleVolumes.filter(
      (mv) => MUSCLE_SLUG_MAP[mv.muscle_group],
    );
    if (!filtered.length) return [];

    const maxVol = Math.max(...filtered.map((mv) => mv.total_volume));
    if (maxVol === 0) return [];

    const slugMap = new Map<Slug, number>();
    for (const mv of filtered) {
      const slugs = MUSCLE_SLUG_MAP[mv.muscle_group];
      if (!slugs) continue;
      const ratio = mv.total_volume / maxVol; // 0–1
      // Map to intensity 1–4
      const intensity = Math.max(1, Math.ceil(ratio * 4)) as 1 | 2 | 3 | 4;
      for (const slug of slugs) {
        // Keep the highest intensity if the slug appears for multiple groups
        const existing = slugMap.get(slug) ?? 0;
        if (intensity > existing) slugMap.set(slug, intensity);
      }
    }

    return Array.from(slugMap.entries()).map(([slug, intensity]) => ({
      slug,
      intensity,
    }));
  }, [muscleVolumes]);

  if (!bodyData.length) return null;

  const defaultFill = isDark ? "#2a2a2a" : "#e8e8e8";
  const border = isDark ? "#3a3a3a" : "#d0d0d0";

  return (
    <View style={styles.container}>
      <View style={styles.bodies}>
        {/* Front view */}
        <Body
          data={bodyData}
          side="front"
          gender="male"
          scale={0.95}
          colors={HEATMAP_COLORS}
          defaultFill={defaultFill}
          border={border}
        />
        {/* Back view */}
        <Body
          data={bodyData}
          side="back"
          gender="male"
          scale={0.95}
          colors={HEATMAP_COLORS}
          defaultFill={defaultFill}
          border={border}
        />
      </View>
      {/* Legend */}
      <View style={styles.legend}>
        <Text style={[styles.legendLabel, { color: isDark ? "#888" : "#999" }]}>
          Less
        </Text>
        {HEATMAP_COLORS.map((c) => (
          <View key={c} style={[styles.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={[styles.legendLabel, { color: isDark ? "#888" : "#999" }]}>
          More
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 8,
  },
  bodies: {
    flexDirection: "row",
    justifyContent: "center",
    marginHorizontal: -8,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  legendCell: {
    width: 11,
    height: 11,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 9,
  },
});
