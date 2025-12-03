/**
 * Process management utilities for TaskRunner.
 */
import { readFileSync } from "node:fs";

/**
 * Check if a PID is alive (exists as a process).
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = check existence
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the start time of a process (Linux only).
 */
export function getProcessStartTime(pid: number): number {
  // On Linux, read from /proc/{pid}/stat
  // Field 22 is starttime in clock ticks since boot
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
    const fields = stat.split(" ");
    const startTimeTicks = parseInt(fields[21], 10);
    const uptimeSeconds = parseFloat(
      readFileSync("/proc/uptime", "utf-8").split(" ")[0]
    );
    const bootTime = Date.now() - uptimeSeconds * 1000;
    const ticksPerSecond = 100; // Usually 100 on Linux
    return bootTime + (startTimeTicks / ticksPerSecond) * 1000;
  } catch {
    throw new Error("Cannot get process start time on this platform");
  }
}

/**
 * Check if a process is alive AND matches expected start time.
 * Handles PID reuse by comparing start times.
 */
export function isProcessAlive(pid: number, expectedStartTime: string): boolean {
  if (!isPidAlive(pid)) {
    return false;
  }

  try {
    const procStartTime = getProcessStartTime(pid);
    const taskStartTime = new Date(expectedStartTime).getTime();
    // Allow 5 second tolerance for start time comparison
    return Math.abs(procStartTime - taskStartTime) < 5000;
  } catch {
    // Can't get start time - assume it's our process if PID exists
    return true;
  }
}
