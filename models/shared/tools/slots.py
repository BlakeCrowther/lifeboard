"""Build slots: caps how many Blender jobs (builds and verify runs) run at once, so parallel pipeline agents (one per
plant) share a small machine instead of all crawling. Slot count: env LB_BUILD_SLOTS, else half the CPU cores (min 1).
Time spent queued for a slot is credited back to the run ledger (ledger.add_wait), so a queued plant's minutes measure
its own work, not the others'.

Usage: python3 models/shared/tools/slots.py [--run <run_id>] -- <command...>   # runs the command holding one slot
In Python: slots.acquire(run_id) holds a slot until the process exits (build.py does this).
A process that already holds a slot sets LB_SLOT_HELD=1, so its children (verify.sh's Blender calls) don't queue again.
Exit: the command's exit code; 2 on usage."""

import fcntl
import os
import subprocess
import sys
import time

TOOLS = os.path.dirname(os.path.abspath(__file__))
SLOT_DIR = os.path.join(os.path.dirname(os.path.dirname(TOOLS)), "out", "runs", "slots")  # models/out/runs/slots


def slot_count() -> int:
    env = os.environ.get("LB_BUILD_SLOTS", "")
    if env.isdigit() and int(env) > 0:
        return int(env)
    return max(1, (os.cpu_count() or 2) // 2)


def acquire(run_id: str | None = None, poll_s: float = 2.0) -> int | None:
    """Blocks until a slot is free; returns its locked fd (None if this process tree already holds one)."""
    if os.environ.get("LB_SLOT_HELD"):
        return None
    os.makedirs(SLOT_DIR, exist_ok=True)
    started = time.time()
    announced = False
    while True:
        for i in range(slot_count()):
            fd = os.open(os.path.join(SLOT_DIR, f"slot{i}.lock"), os.O_CREAT | os.O_RDWR)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                os.close(fd)
                continue
            waited = time.time() - started
            if announced:
                print(f"SLOT {i} after {waited:.0f} s queued", flush=True)
            if run_id and waited >= 1:
                sys.path.insert(0, TOOLS)
                import ledger

                print("LEDGER", ledger.add_wait(run_id, waited)[1], flush=True)
            os.environ["LB_SLOT_HELD"] = "1"
            return fd
        if not announced:
            print(f"SLOT all {slot_count()} build slots busy, queued (not counted against the run)", flush=True)
            announced = True
        time.sleep(poll_s)


def main(argv: list[str]) -> int:
    run_id = None
    if argv[:1] == ["--run"] and len(argv) >= 2:
        run_id, argv = argv[1], argv[2:]
    if argv[:1] != ["--"] or len(argv) < 2:
        print(__doc__)
        return 2
    acquire(run_id)
    return subprocess.call(argv[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
