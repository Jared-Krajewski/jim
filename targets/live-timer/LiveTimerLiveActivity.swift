import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

struct LiveTimerLiveActivity: Widget {

    var body: some WidgetConfiguration {

        ActivityConfiguration(for: LiveTimerAttributes.self) { context in

            TimerActivityView(
                endTime: context.state.endTime,
                totalSeconds: context.state.totalSeconds,
                isRunning: context.state.isRunning
            )

        } dynamicIsland: { context in

            DynamicIsland {

                DynamicIslandExpandedRegion(.center) {
                    DynamicIslandExpandedTimerView(
                        endTime: context.state.endTime,
                        totalSeconds: context.state.totalSeconds
                    )
                }

            } compactLeading: {
                DynamicIslandCompactLeadingTimerView(
                    endTime: context.state.endTime,
                    totalSeconds: context.state.totalSeconds
                )

            } compactTrailing: {
                DynamicIslandCompactTrailingTimerView(endTime: context.state.endTime)

            } minimal: {
                DynamicIslandMinimalTimerView(endTime: context.state.endTime)
            }
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

private func formatSeconds(_ sec: Int) -> String {

    let m = sec / 60
    let s = sec % 60

    return String(format: "%02d:%02d", m, s)
}

private func shortFormatSeconds(_ sec: Int) -> String {

    let m = sec / 60
    let s = sec % 60

    return "\(m):" + String(format: "%02d", s)
}

// ── Lock Screen View ──────────────────────────────────────────────────────────

private struct TimerActivityView: View {

    let endTime: Date
    let totalSeconds: Int
    let isRunning: Bool

    var body: some View {

        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            let isFinished = timeline.date >= endTime
            let accentColor = isFinished ? Color.green : Color.blue

            HStack(spacing: 12) {

                ZStack {

                    Circle()
                        .fill(accentColor.opacity(0.18))
                        .frame(width: 44, height: 44)

                    Image(systemName: "timer")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(accentColor)
                }

                VStack(alignment: .leading, spacing: 2) {

                    Text(isFinished ? "Rest Complete" : "Rest Timer")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.primary)

                    if isFinished {

                        Text(formatSeconds(totalSeconds))
                            .font(
                                .system(
                                    .title2,
                                    design: .monospaced,
                                    weight: .bold
                                )
                            )
                            .monospacedDigit()
                            .foregroundColor(.green)

                    } else {

                        Text(
                            timerInterval: timeline.date...endTime,
                            countsDown: true
                        )
                        .font(
                            .system(
                                .title2,
                                design: .monospaced,
                                weight: .bold
                            )
                        )
                        .monospacedDigit()
                        .foregroundColor(.primary)
                    }
                }

                Spacer()

                if #available(iOS 17.2, *) {

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

                    if isRunning && !isFinished {

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
}

private struct DynamicIslandExpandedTimerView: View {

    let endTime: Date
    let totalSeconds: Int

    var body: some View {

        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            let isFinished = timeline.date >= endTime
            let accentColor = isFinished ? Color.green : Color.blue

            HStack(spacing: 10) {

                Image(systemName: "timer")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(accentColor)

                if isFinished {

                    Text(shortFormatSeconds(totalSeconds))
                        .font(
                            .system(
                                size: 28,
                                design: .monospaced
                            ).weight(.bold)
                        )
                        .monospacedDigit()

                } else {

                    Text(
                        timerInterval: timeline.date...endTime,
                        countsDown: true
                    )
                    .font(
                        .system(
                            size: 28,
                            design: .monospaced
                        ).weight(.bold)
                    )
                    .monospacedDigit()
                }
            }
            .foregroundColor(.white)
        }
    }
}

private struct DynamicIslandCompactLeadingTimerView: View {

    let endTime: Date
    let totalSeconds: Int

    var body: some View {

        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            let isFinished = timeline.date >= endTime

            if isFinished {

                Text(shortFormatSeconds(totalSeconds))
                    .font(
                        .system(
                            size: 16,
                            design: .monospaced
                        ).weight(.bold)
                    )
                    .foregroundColor(.green)
                    .monospacedDigit()
                    .frame(width: 42, alignment: .center)
                    .fixedSize()

            } else {

                Text(
                    timerInterval: timeline.date...endTime,
                    pauseTime: nil,
                    countsDown: true,
                    showsHours: false
                )
                .font(
                    .system(
                        size: 16,
                        design: .monospaced
                    ).weight(.bold)
                )
                .foregroundColor(.blue)
                .monospacedDigit()
                .frame(width: 42, alignment: .center)
                .fixedSize()
            }
        }
    }
}

private struct DynamicIslandCompactTrailingTimerView: View {

    let endTime: Date

    var body: some View {

        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            let isFinished = timeline.date >= endTime

            if isFinished {

                Image(systemName: "timer")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.green)

            } else {

                ProgressView(
                    timerInterval: timeline.date...endTime,
                    countsDown: true
                )
                .progressViewStyle(.circular)
                .tint(.blue)
                .foregroundStyle(.clear)
            }
        }
    }
}

private struct DynamicIslandMinimalTimerView: View {

    let endTime: Date

    var body: some View {

        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            let isFinished = timeline.date >= endTime

            if isFinished {

                Image(systemName: "timer")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.green)

            } else {

                ProgressView(
                    timerInterval: timeline.date...endTime,
                    countsDown: true
                )
                .progressViewStyle(.circular)
                .tint(.blue)
                .foregroundStyle(.clear)
            }
        }
    }
}

// ── Preview Helpers ───────────────────────────────────────────────────────────

extension LiveTimerAttributes {

    static var preview: LiveTimerAttributes {
        LiveTimerAttributes()
    }
}

extension LiveTimerAttributes.ContentState {

    static var running: LiveTimerAttributes.ContentState {

        .init(
            endTime: Date.now.addingTimeInterval(90),
            totalSeconds: 90,
            isRunning: true
        )
    }

    static var stopped: LiveTimerAttributes.ContentState {

        .init(
            endTime: Date.now,
            totalSeconds: 90,
            isRunning: false
        )
    }
}

// ── Previews ──────────────────────────────────────────────────────────────────

@available(iOS 17.2, *)
#Preview(
    "Lock Screen Running",
    as: .content,
    using: LiveTimerAttributes.preview
) {

    LiveTimerLiveActivity()

} contentStates: {

    LiveTimerAttributes.ContentState.running
}

@available(iOS 17.2, *)
#Preview(
    "Lock Screen Stopped",
    as: .content,
    using: LiveTimerAttributes.preview
) {

    LiveTimerLiveActivity()

} contentStates: {

    LiveTimerAttributes.ContentState.stopped
}

@available(iOS 17.2, *)
#Preview(
    "Dynamic Island Compact",
    as: .dynamicIsland(.compact),
    using: LiveTimerAttributes.preview
) {

    LiveTimerLiveActivity()

} contentStates: {

    LiveTimerAttributes.ContentState.running
}

@available(iOS 17.2, *)
#Preview(
    "Dynamic Island Minimal",
    as: .dynamicIsland(.minimal),
    using: LiveTimerAttributes.preview
) {

    LiveTimerLiveActivity()

} contentStates: {

    LiveTimerAttributes.ContentState.running
}
