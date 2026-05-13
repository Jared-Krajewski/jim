import Foundation
import ActivityKit

/// Native module that starts, updates, and ends a LiveTimerAttributes Live Activity.
/// Called from JS via NativeModules.LiveTimerBridge.
///
/// LiveTimerAttributes is defined in targets/_shared/LiveTimerAttributes.swift,
/// which @bacons/apple-targets links into the main app target automatically.
@objc(LiveTimerBridge)
class LiveTimerBridge: NSObject {

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
            staleDate: endTime.addingTimeInterval(30)
        )

        // If a Live Activity already exists, update it instead of creating a new one.
        if let existing = Activity<LiveTimerAttributes>.activities.first {
            Task {
                await existing.update(content)
                resolve(existing.id)
            }
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

    // MARK: - Update state (e.g. timer stopped, without ending the activity)

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

        // Always UPDATE — never end — so the lock-screen Reset button can still
        // find the activity (activity.end() puts it in .ended state, which
        // ResetTimerIntent/StopTimerIntent cannot see).
        // When stopped, give a 5-min stale window so the widget persists for reset.
        let staleDate = isRunning
            ? endTime.addingTimeInterval(30)
            : Date().addingTimeInterval(60 * 5)
        let content = ActivityContent(state: state, staleDate: staleDate)

        Task {
            for activity in Activity<LiveTimerAttributes>.activities {
                await activity.update(content)
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

        if let activity = Activity<LiveTimerAttributes>.activities.first {
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

