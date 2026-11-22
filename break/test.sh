#!/bin/sh
# Unit-tests the break timer's pure pacing logic. Run: break/test.sh
set -e
cd "$(dirname "$0")"
T=$(mktemp -d)
cp Pacing.swift "$T/Pacing.swift"
cp pacing-test.swift "$T/main.swift"
swiftc -swift-version 5 -o "$T/t" "$T/Pacing.swift" "$T/main.swift"
"$T/t"
rm -rf "$T"
