/**
 * AppThemeProvider — wraps the app and lets the user override the system
 * light/dark preference. The choice is persisted to a small JSON file so
 * it survives app restarts.
 *
 * useColorScheme() — drop-in replacement for RN's hook; reads from this
 * context so all screens react to user-chosen overrides.
 *
 * useAppTheme() — returns { colorScheme, setColorScheme } for the settings
 * toggle that changes and saves the preference.
 */

import { File, Paths } from "expo-file-system";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

type ColorSchemeName = "light" | "dark";

interface ThemeContextValue {
  colorScheme: ColorSchemeName;
  setColorScheme: (scheme: ColorSchemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colorScheme: "dark",
  setColorScheme: () => {},
});

const prefsFile = new File(Paths.document, "jim-theme-prefs.json");

function writePref(scheme: ColorSchemeName) {
  try {
    const json = JSON.stringify({ colorScheme: scheme });
    if (!prefsFile.exists) prefsFile.create();
    prefsFile.write(json);
  } catch {
    // Ignore file write errors — the in-memory state is still correct.
  }
}

export function AppThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const system = useSystemColorScheme() ?? "dark";
  const [colorScheme, setColorSchemeState] = useState<ColorSchemeName>(system);

  // Load saved preference once on mount (async because file.text() is async)
  useEffect(() => {
    if (!prefsFile.exists) return;
    prefsFile
      .text()
      .then((text) => {
        const parsed = JSON.parse(text);
        if (parsed.colorScheme === "light" || parsed.colorScheme === "dark") {
          setColorSchemeState(parsed.colorScheme);
        }
      })
      .catch(() => {
        // Corrupt or missing file — fall back to system default, which is
        // already in state.
      });
  }, []);

  function setColorScheme(scheme: ColorSchemeName) {
    setColorSchemeState(scheme);
    writePref(scheme);
  }

  return (
    <ThemeContext.Provider value={{ colorScheme, setColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Drop-in replacement for React Native's useColorScheme(). */
export function useColorScheme(): ColorSchemeName {
  return useContext(ThemeContext).colorScheme;
}

/** Use in the settings screen to read and toggle the stored preference. */
export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
