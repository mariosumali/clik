import Foundation

enum MainTab: String, CaseIterable, Identifiable {
    case clickEngine = "Click Engine"
    case macros = "Macros"
    case targeting = "Targeting"
    case humanization = "Humanization"
    case triggers = "Triggers"
    case profiles = "Profiles"

    var id: String { rawValue }
}
