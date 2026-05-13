/**
 * UnitContext — tracks the user's preferred weight unit (lbs / kg).
 * The choice is persisted to a small JSON file so it survives restarts.
 */
import { File, Paths } from "expo-file-system";
import React, { createContext, useContext, useEffect, useState } from "react";

export type WeightUnit = "lbs" | "kg";

interface UnitContextValue {
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
}

const UnitContext = createContext<UnitContextValue>({
  unit: "lbs",
  setUnit: () => {},
});

const prefsFile = new File(Paths.document, "jim-unit-prefs.json");

function writePref(u: WeightUnit) {
  try {
    const json = JSON.stringify({ unit: u });
    if (!prefsFile.exists) prefsFile.create();
    prefsFile.write(json);
  } catch {
    // ignore file errors — in-memory state is still correct
  }
}

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>("lbs");

  useEffect(() => {
    if (!prefsFile.exists) return;
    prefsFile
      .text()
      .then((text) => {
        const parsed = JSON.parse(text);
        if (parsed.unit === "lbs" || parsed.unit === "kg") {
          setUnitState(parsed.unit);
        }
      })
      .catch(() => {});
  }, []);

  function setUnit(u: WeightUnit) {
    setUnitState(u);
    writePref(u);
  }

  return (
    <UnitContext.Provider value={{ unit, setUnit }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit(): UnitContextValue {
  return useContext(UnitContext);
}
