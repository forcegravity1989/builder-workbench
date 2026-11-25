// Why: one client opens several authenticated sockets (requests, shared control, terminal streams).
// The access log records a member connecting once, on the first socket, and leaving once, on the last.
// Counting is keyed by member device, not by link token, so several members sharing one team link are
// tracked independently and nobody's departure is hidden by another member still being online.
export class RuntimeAccessSocketTracker {
  private readonly socketsByDevice = new Map<string, Set<string>>()

  /** Returns true when this is the device's first open socket. */
  open(deviceId: string, connectionId: string): boolean {
    const sockets = this.socketsByDevice.get(deviceId) ?? new Set<string>()
    this.socketsByDevice.set(deviceId, sockets)
    const isFirst = sockets.size === 0
    sockets.add(connectionId)
    return isFirst
  }

  /** Returns true when the closed socket was the device's last open socket. */
  close(deviceId: string, connectionId: string): boolean {
    const sockets = this.socketsByDevice.get(deviceId)
    if (!sockets?.delete(connectionId)) {
      return false
    }
    if (sockets.size > 0) {
      return false
    }
    this.socketsByDevice.delete(deviceId)
    return true
  }
}
