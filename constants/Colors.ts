const accent = "#39453e";
const badgeAccent = "#e8d8c9";
const success = "#22C55E";
const danger = "#EF4444";
const warning = "#F59E0B";
const teal = "#e8d8c9";

const Colors = {
  accent,
  badgeAccent,
  success,
  danger,
  warning,
  teal,
  light: {
    text: "#1A1A1A",
    textSecondary: "#666666",
    textMuted: "#999999",
    background: "#F2F2F7",
    card: "#FFFFFF",
    border: "#E5E5EA",
    tint: accent,
    tabIconDefault: "#AEAEB2",
    tabIconSelected: accent,
    inputBg: "#FFFFFF",
    skeleton: "#E5E5EA",
    badgeText: "#1A1A1A",
  },
  dark: {
    text: "#e8d8c9",
    textSecondary: "#e8d8c9",
    textMuted: "#b8b8b8",
    background: "#0F0F0F",
    card: "#1C1C1E",
    border: "#2C2C2E",
    tint: accent,
    tabIconDefault: "#e8d8c9",
    tabIconSelected: "#698072",
    inputBg: "#2C2C2E",
    skeleton: "#2C2C2E",
    badgeText: badgeAccent,
  },
};

export default Colors;

export type ThemeColors = typeof Colors.light;
