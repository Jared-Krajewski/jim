// Objective-C shim that exposes the Swift LiveTimerBridge class to the React
// Native bridge via the RCT_EXTERN_MODULE / RCT_EXTERN_METHOD pattern.
// This file must stay in the main app target alongside LiveTimerBridge.swift.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveTimerBridge, NSObject)

RCT_EXTERN_METHOD(startActivity:(double)endTimeMs
                  totalSeconds:(NSInteger)totalSeconds
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(double)endTimeMs
                  totalSeconds:(NSInteger)totalSeconds
                  isRunning:(BOOL)isRunning
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getActivityState:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end

