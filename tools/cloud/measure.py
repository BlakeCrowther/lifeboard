#!/usr/bin/env python3
"""Run a command and print wall-clock seconds and peak memory (largest child, MB) to stderr.
Usage: tools/cloud/measure.py <label> <command> [args...]   (no GNU time needed on the VM)"""
import resource, subprocess, sys, time
label, cmd = sys.argv[1], sys.argv[2:]
t = time.time()
rc = subprocess.call(cmd)
sec = time.time() - t
mb = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024
print(f"MEASURE {label}: {sec:.1f}s wall, peak {mb:.0f} MB, exit {rc}", file=sys.stderr)
sys.exit(rc)
