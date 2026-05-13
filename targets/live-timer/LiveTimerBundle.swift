import SwiftUI
import WidgetKit

/// Entry point for the LiveTimer widget extension.
/// All widgets/Live Activities exported by this extension are listed here.
@main
struct LiveTimerBundle: WidgetBundle {
    var body: some Widget {
        LiveTimerLiveActivity()
    }
}
