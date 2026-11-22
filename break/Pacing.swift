// Pure decision for what the break timer does after the Mac was away (asleep, locked, suspended).
import Foundation

enum AwayOutcome: Equatable {
    case resetWork                      // away long enough to count as a break: full work period again
    case resume(shiftBy: TimeInterval)  // short absence: push the next break out by the time away
    case endBreak                       // was on a break overlay: the break is over, restart work period
}

enum Pacing {
    /// Gap between 1s ticks above which the process must have been suspended.
    static let suspendGap: TimeInterval = 5
    /// Absence during an overlay break that ends it (the user already rested; never make them wait).
    static let minAwayEndsBreak: TimeInterval = 30

    static func afterAway(away: TimeInterval, breakLength: TimeInterval, onBreak: Bool) -> AwayOutcome {
        if onBreak { return away >= minAwayEndsBreak ? .endBreak : .resume(shiftBy: away) }
        return away >= breakLength ? .resetWork : .resume(shiftBy: away)
    }
}
