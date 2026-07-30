import Foundation

enum ReviewEligibility {
    private static let defaults = UserDefaults.standard
    private static let successCount = "review.successCount"
    private static let firstSuccess = "review.firstSuccess"
    private static let lastRequest = "review.lastRequest"

    /// Records real value delivered. Apple still decides whether the system prompt appears.
    static func recordSuccess(now: Date = Date()) -> Bool {
        let count = defaults.integer(forKey: successCount) + 1
        defaults.set(count, forKey: successCount)
        if defaults.object(forKey: firstSuccess) == nil { defaults.set(now, forKey: firstSuccess) }
        guard count >= 3,
              let first = defaults.object(forKey: firstSuccess) as? Date,
              now.timeIntervalSince(first) >= 7 * 86_400 else { return false }
        if let last = defaults.object(forKey: lastRequest) as? Date,
           now.timeIntervalSince(last) < 120 * 86_400 { return false }
        defaults.set(now, forKey: lastRequest)
        return true
    }
}
