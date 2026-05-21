import ActivityKit
import Foundation
import UIKit

/// Native module that starts, updates, and ends a LiveTimerAttributes Live Activity.
/// Called from JS via NativeModules.LiveTimerBridge.
///
/// LiveTimerAttributes is defined in targets/_shared/LiveTimerAttributes.swift,
/// which @bacons/apple-targets links into the main app target automatically.
@objc(LiveTimerBridge)
class LiveTimerBridge: NSObject {

    private let stoppedActivityLifetime: TimeInterval = 60 * 5

    @available(iOS 16.2, *)
    private func dismissalPolicy(after referenceDate: Date) -> ActivityUIDismissalPolicy {
        let dismissAt = referenceDate.addingTimeInterval(stoppedActivityLifetime)
        if dismissAt <= Date() {
            return .immediate
        }
        return .after(dismissAt)
    }

    @available(iOS 16.2, *)
    private static func endAllActivitiesImmediately() async {
        await withTaskGroup(of: Void.self) { group in
            for activity in Activity<LiveTimerAttributes>.activities {
                group.addTask {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
    }

    @objc
    static func endAllActivitiesImmediatelySynchronously() {
        guard #available(iOS 16.2, *) else { return }

        let semaphore = DispatchSemaphore(value: 0)
        Task.detached(priority: .userInitiated) {
            await endAllActivitiesImmediately()
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 2.0)
    }

    // MARK: - Init / deinit

    override init() {
        super.init()
    }

    // MARK: - Start (or update if one already exists)

    @objc(startActivity:totalSeconds:resolve:reject:)
    func startActivity(
        _ endTimeMs: Double,
        totalSeconds: Int,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(NSNull())
            return
        }

        let endTime = Date(timeIntervalSince1970: endTimeMs / 1000.0)
        let state = LiveTimerAttributes.ContentState(endTime: endTime, totalSeconds: totalSeconds, isRunning: true)
        let content = ActivityContent(
            state: state,
            staleDate: endTime.addingTimeInterval(stoppedActivityLifetime)
        )

        Task {
            let now = Date()

            // Remove any previously-stopped or already-expired activity before
            // starting the next timer so only the newest countdown remains.
            for activity in Activity<LiveTimerAttributes>.activities {
                let existingState = activity.content.state
                guard !existingState.isRunning || existingState.endTime <= now else {
                    continue
                }

                let finishedState = LiveTimerAttributes.ContentState(
                    endTime: existingState.endTime,
                    totalSeconds: existingState.totalSeconds,
                    isRunning: false
                )
                let finishedContent = ActivityContent(state: finishedState, staleDate: nil)
                await activity.end(finishedContent, dismissalPolicy: .immediate)
            }

            if let existing = Activity<LiveTimerAttributes>.activities.first(where: {
                ($0.activityState == .active || $0.activityState == .stale)
                    && $0.content.state.isRunning
                    && $0.content.state.endTime > now
            }) {
                await existing.update(content)
                resolve(existing.id)
                return
            }

            do {
                let activity = try Activity<LiveTimerAttributes>.request(
                    attributes: LiveTimerAttributes(),
                    content: content,
                    pushType: nil
                )
                resolve(activity.id)
            } catch {
                reject("LIVE_ACTIVITY_ERROR", error.localizedDescription, error)
            }
        }
    }

    // MARK: - Update state

    @objc(updateActivity:totalSeconds:isRunning:resolve:reject:)
    func updateActivity(
        _ endTimeMs: Double,
        totalSeconds: Int,
        isRunning: Bool,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(NSNull())
            return
        }

        let endTime = Date(timeIntervalSince1970: endTimeMs / 1000.0)
        let state = LiveTimerAttributes.ContentState(endTime: endTime, totalSeconds: totalSeconds, isRunning: isRunning)

        Task {
            let liveable = Activity<LiveTimerAttributes>.activities.filter {
                $0.activityState == .active || $0.activityState == .stale
            }
            if isRunning {
                // Timer is running — keep the activity alive with a 5-minute
                // stale buffer to prevent the spinner if the app is backgrounded.
                let content = ActivityContent(
                    state: state,
                    staleDate: endTime.addingTimeInterval(stoppedActivityLifetime)
                )
                for activity in liveable {
                    await activity.update(content)
                }
            } else {
                // Timer stopped or finished — keep the activity active for the
                // 5-minute finished window so the Dynamic Island / lock screen
                // can continue rendering the green completed state. JS or the
                // native terminate hook will remove it later.
                let content = ActivityContent(
                    state: state,
                    staleDate: endTime.addingTimeInterval(stoppedActivityLifetime)
                )
                for activity in liveable {
                    await activity.update(content)
                }
            }
            resolve(NSNull())
        }
    }

    // MARK: - Get current activity state (for syncing app UI after widget interactions)

    @objc(getActivityState:reject:)
    func getActivityState(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(NSNull())
            return
        }

        // Skip ended/dismissed activities — they remain in Activity.activities
        // until the system removes them, but their state is stale.
        if let activity = Activity<LiveTimerAttributes>.activities.first(where: {
            $0.activityState == .active || $0.activityState == .stale
        }) {
            let s = activity.content.state
            resolve([
                "isRunning": s.isRunning,
                "endTimeMs": s.endTime.timeIntervalSince1970 * 1000.0,
                "totalSeconds": s.totalSeconds
            ] as [String: Any])
        } else {
            resolve(NSNull())
        }
    }

    // MARK: - End

    @objc(endActivity:reject:)
    func endActivity(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(NSNull())
            return
        }

        Task {
            for activity in Activity<LiveTimerAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            resolve(NSNull())
        }
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }
}

