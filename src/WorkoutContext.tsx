import { completeSession, getInProgressSession } from "@/src/db/database";
import React, { createContext, useContext, useEffect, useState } from "react";

export type ActiveWorkout = {
  sessionId: number;
  sessionName: string;
};

type WorkoutContextType = {
  activeWorkout: ActiveWorkout | null;
  setActiveWorkout: (w: ActiveWorkout | null) => void;
  /** Exercise IDs that the user has marked "Done" in the current session */
  finishedExerciseIds: Set<number>;
  setFinishedExerciseIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  /** Ordered list of exercise IDs for the current session */
  exerciseOrder: number[];
  setExerciseOrder: React.Dispatch<React.SetStateAction<number[]>>;
};

export const WorkoutContext = createContext<WorkoutContextType>({
  activeWorkout: null,
  setActiveWorkout: () => {},
  finishedExerciseIds: new Set(),
  setFinishedExerciseIds: () => {},
  exerciseOrder: [],
  setExerciseOrder: () => {},
});

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkout, setActiveWorkoutState] = useState<ActiveWorkout | null>(
    null,
  );
  const [finishedExerciseIds, setFinishedExerciseIds] = useState<Set<number>>(
    new Set(),
  );
  const [exerciseOrder, setExerciseOrder] = useState<number[]>([]);

  // On app launch, restore any incomplete session from SQLite so the
  // In Progress banner appears even after a force-quit / restart.
  // Sessions older than 2.5 hours are auto-completed to avoid stale data.
  useEffect(() => {
    getInProgressSession()
      .then(async (session) => {
        if (session) {
          const elapsedMs = Date.now() - session.started_at * 1000;
          const maxMs = 2.5 * 60 * 60 * 1000; // 2.5 hours
          if (elapsedMs >= maxMs) {
            // Set completed_at to started_at + 2.5 hours (in seconds)
            const completedAt = session.started_at + Math.floor(2.5 * 60 * 60);
            await completeSession(session.id, completedAt);
          } else {
            setActiveWorkoutState({
              sessionId: session.id,
              sessionName: session.name,
            });
          }
        }
      })
      .catch(() => {});
  }, []);

  function setActiveWorkout(w: ActiveWorkout | null) {
    if (!w) {
      // Reset session-scoped state when ending a workout
      setFinishedExerciseIds(new Set());
      setExerciseOrder([]);
    }
    setActiveWorkoutState(w);
  }

  return (
    <WorkoutContext.Provider
      value={{
        activeWorkout,
        setActiveWorkout,
        finishedExerciseIds,
        setFinishedExerciseIds,
        exerciseOrder,
        setExerciseOrder,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  return useContext(WorkoutContext);
}
