import ActiveWorkoutScreen from "@/src/components/ActiveWorkout";
import { useLocalSearchParams } from "expo-router";

export default function LogFromTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ActiveWorkoutScreen templateId={Number(id)} />;
}
