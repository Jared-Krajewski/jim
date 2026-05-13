import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { AppState } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { getDatabase } from "@/src/db/database";
import { AppThemeProvider } from "@/src/ThemeContext";
import { TimerProvider } from "@/src/TimerContext";
import { UnitProvider } from "@/src/UnitContext";
import { WorkoutProvider } from "@/src/WorkoutContext";

// Suppress notification banners/sounds when the app is already in the
// foreground — the TimerContext plays the in-app alert sound instead.
Notifications.setNotificationHandler({
  handleNotification: async () => {
    const appIsActive = AppState.currentState === "active";
    return {
      shouldShowAlert: !appIsActive,
      shouldPlaySound: !appIsActive,
      shouldSetBadge: false,
      shouldShowBanner: !appIsActive,
      shouldShowList: !appIsActive,
    };
  },
});

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    // Initialize DB eagerly so first screen renders fast
    getDatabase().catch(console.error);
  }, []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AppThemeProvider>
      <UnitProvider>
        <RootLayoutNav />
      </UnitProvider>
    </AppThemeProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <WorkoutProvider>
      <TimerProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="workout/new"
              options={{ title: "New Template", presentation: "modal" }}
            />
            <Stack.Screen
              name="workout/[id]"
              options={{ title: "Edit Template" }}
            />
            <Stack.Screen name="log/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="log/adhoc" options={{ headerShown: false }} />
            <Stack.Screen
              name="session/[id]"
              options={{ title: "Session Details" }}
            />
            <Stack.Screen
              name="settings"
              options={{ presentation: "modal", headerShown: false }}
            />
            <Stack.Screen name="+not-found" />
          </Stack>
        </ThemeProvider>
      </TimerProvider>
    </WorkoutProvider>
  );
}
