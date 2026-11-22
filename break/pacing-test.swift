// Run by break/test.sh. Exits non-zero on the first failed expectation.
import Foundation
var failed = 0
func expect(_ got: AwayOutcome, _ want: AwayOutcome, _ name: String) {
    if got != want { print("FAIL \(name): got \(got), want \(want)"); failed += 1 } else { print("ok   \(name)") }
}
let brk: TimeInterval = 300
expect(Pacing.afterAway(away: 8 * 3600, breakLength: brk, onBreak: false), .resetWork, "overnight sleep does not start a break")
expect(Pacing.afterAway(away: brk, breakLength: brk, onBreak: false), .resetWork, "away exactly a break counts as a break")
expect(Pacing.afterAway(away: 120, breakLength: brk, onBreak: false), .resume(shiftBy: 120), "short lock keeps remaining work time")
expect(Pacing.afterAway(away: 3600, breakLength: brk, onBreak: true), .endBreak, "slept during overlay: break over on wake")
expect(Pacing.afterAway(away: 10, breakLength: brk, onBreak: true), .resume(shiftBy: 10), "blip during overlay keeps it")
exit(failed == 0 ? 0 : 1)
