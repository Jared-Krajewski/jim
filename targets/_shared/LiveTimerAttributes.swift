import ActivityKit
import Foundation

// Shared between the main app target (used by ActivityKit to start/end)
// and the live-timer widget extension (used by SwiftUI to render the UI).
// @bacons/apple-targets links _shared/ files to both automatically.
struct LiveTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// The absolute time when the rest timer ends.
        var endTime: Date
        /// Original duration in seconds (used by reset).
        var totalSeconds: Int
        /// Whether the timer is actively counting down.
        var isRunning: Bool
    }
}
