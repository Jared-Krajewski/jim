import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

struct LiveTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveTimerAttributes.self) { context in
            // ── Lock screen / Notification Center ─────────────────────────────
            LockScreenView(
                endTime: context.state.endTime,
                totalSeconds: context.state.totalSeconds,
                isRunning: context.state.isRunning
            )
        } dynamicIsland: { context in
            // ── Dynamic Island ────────────────────────────────────────────────
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Rest", systemImage: "timer")
                        .font(.caption2.bold())
                        .foregroundColor(.secondary)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    if context.state.isRunning {
                        Text(timerInterval: Date.now...context.state.endTime, countsDown: true)
                            .font(.system(.title, design: .monospaced, weight: .bold))
                            .monospacedDigit()
                            .foregroundColor(.primary)
                    } else {
                        Text(formatSeconds(context.state.totalSeconds))
                            .font(.system(.title, design: .monospaced, weight: .bold))
                            .monospacedDigit()
                            .foregroundColor(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if #available(iOS 17.2, *) {
                        HStack(spacing: 8) {
                            Button(intent: ResetTimerIntent()) {
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.blue)
                            }
                            .buttonStyle(.plain)
                            if context.state.isRunning {
                                Button(intent: StopTimerIntent()) {
                                    Image(systemName: "stop.fill")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(.red)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.trailing, 4)
                    }
                }
            } compactLeading: {
                // No leading content — keeps the pill from expanding to the left
                // so Spotify / other apps can own the full compact presentation.
                EmptyView()
            } compactTrailing: {
                // Small timer icon — appears as a subtle indicator near the
                // right side of the Dynamic Island sensor.
                Image(systemName: "timer")
                    .foregroundColor(context.state.isRunning ? .blue : .secondary)
                    .font(.system(size: 11, weight: .semibold))
            } minimal: {
                // The "small circle" to the right when another activity (e.g.
                // Spotify) is in the compact pill — this is the primary view.
                Image(systemName: "timer")
                    .foregroundColor(context.state.isRunning ? .blue : .secondary)
                    .font(.footnote)
            }
        }
        .contentMarginsDisabled()
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

private func formatSeconds(_ sec: Int) -> String {
    let m = sec / 60
    let s = sec % 60
    return String(format: "%02d:%02d", m, s)
}

// ── Lock-screen view ──────────────────────────────────────────────────────────

private struct LockScreenView: View {
    let endTime: Date
    let totalSeconds: Int
    let isRunning: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Timer icon
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.18))
                    .frame(width: 44, height: 44)
                Image(systemName: "timer")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.blue)
            }

            // Label + countdown
            VStack(alignment: .leading, spacing: 2) {
                Text(isRunning ? "Rest Timer" : "Rest Complete")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                if isRunning {
                    Text(timerInterval: Date.now...endTime, countsDown: true)
                        .font(.system(.title2, design: .monospaced, weight: .bold))
                        .monospacedDigit()
                        .foregroundColor(.primary)
                } else {
                    Text(formatSeconds(totalSeconds))
                        .font(.system(.title2, design: .monospaced, weight: .bold))
                        .monospacedDigit()
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Buttons require iOS 17.2+ (LiveActivityIntent fires from lock screen)
            if #available(iOS 17.2, *) {
                // Reset / restart button (always shown)
                Button(intent: ResetTimerIntent()) {
                    ZStack {
                        Circle()
                            .fill(Color.blue.opacity(0.15))
                            .frame(width: 40, height: 40)
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.blue)
                    }
                }
                .buttonStyle(.plain)

                // Stop button (only while running)
                if isRunning {
                    Button(intent: StopTimerIntent()) {
                        ZStack {
                            Circle()
                                .fill(Color.red.opacity(0.15))
                                .frame(width: 40, height: 40)
                            Image(systemName: "stop.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.red)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .activityBackgroundTint(Color.black.opacity(0.55))
        .activitySystemActionForegroundColor(.white)
    }
}

