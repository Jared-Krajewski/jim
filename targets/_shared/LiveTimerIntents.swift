import ActivityKit
import AppIntents
import Foundation

// MARK: - Stop Timer Intent
// LiveActivityIntent (iOS 17.2+) is required for Button(intent:) to fire
// from the lock-screen banner. Plain AppIntent silently fails there.

@available(iOS 17.2, *)
struct StopTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop Timer"
    // openAppWhenRun defaults to false for LiveActivityIntent

    func perform() async throws -> some IntentResult {
        for activity in Activity<LiveTimerAttributes>.activities
            where activity.activityState == .active || activity.activityState == .stale
        {
            // Update to a paused (isRunning=false) state rather than ending
            // the activity. This keeps the activity alive so the Reset button
            // can still find it and restart the countdown.
            let stopped = LiveTimerAttributes.ContentState(
                endTime: Date(),
                totalSeconds: activity.content.state.totalSeconds,
                isRunning: false
            )
            await activity.update(ActivityContent(
                state: stopped,
                staleDate: Date().addingTimeInterval(60 * 5) // keep alive 5 min
            ))
        }
        return .result()
    }
}

// MARK: - Reset Timer Intent
// Restarts the countdown using the same original duration.

@available(iOS 17.2, *)
struct ResetTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Reset Timer"

    func perform() async throws -> some IntentResult {
        for activity in Activity<LiveTimerAttributes>.activities
            where activity.activityState == .active || activity.activityState == .stale
        {
            let total = activity.content.state.totalSeconds
            let newEnd = Date().addingTimeInterval(Double(total))
            let running = LiveTimerAttributes.ContentState(
                endTime: newEnd,
                totalSeconds: total,
                isRunning: true
            )
            await activity.update(ActivityContent(
                state: running,
                staleDate: newEnd.addingTimeInterval(30)
            ))
        }
        return .result()
    }
}
