export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core / Abs",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
  "Full Body",
  "Cardio",
  "Other",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
