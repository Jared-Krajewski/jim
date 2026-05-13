import ActiveWorkoutScreen from "@/src/components/ActiveWorkout";
import { useLocalSearchParams } from "expo-router";

export default function AdHocWorkoutScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  return (
    <ActiveWorkoutScreen
      resumeSessionId={sessionId ? Number(sessionId) : undefined}
    />
  );
}
