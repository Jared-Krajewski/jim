import ActivityKit
import AppIntents
import Foundation
import UserNotifications

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
        // Cancel any pending timer alert so it doesn't fire after the user stopped.
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: ["rest-timer"])
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

            // The JS app is suspended in the background and cannot schedule a
            // notification for this restarted timer — do it here instead.
            let center = UNUserNotificationCenter.current()
            // Remove the previous pending alert before adding the new one.
            center.removePendingNotificationRequests(withIdentifiers: ["rest-timer"])

            let content = UNMutableNotificationContent()
            content.title = "Rest Timer"
            content.body = "Rest complete"
            // Use the same custom sound that plays in-app (only audible when
            // the mute switch is off — no Critical Alerts entitlement needed).
            content.sound = UNNotificationSound(
                named: UNNotificationSoundName("412017__skymary__cat-meow-short.wav")
            )
            if #available(iOS 15.0, *) {
                content.interruptionLevel = .timeSensitive
            }

            let trigger = UNTimeIntervalNotificationTrigger(
                timeInterval: Double(total),
                repeats: false
            )
            let request = UNNotificationRequest(
                identifier: "rest-timer",
                content: content,
                trigger: trigger
            )
            try? await center.add(request)
        }
        return .result()
    }
}
