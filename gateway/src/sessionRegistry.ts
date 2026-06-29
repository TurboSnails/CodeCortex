import type { HookEvent, SessionRecord } from "./types.js";

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionRecord>();

  applyEvent(event: HookEvent): SessionRecord {
    const record: SessionRecord = {
      sessionId: event.session_id,
      cwd: event.cwd,
      status: event.hook_event_name === "Stop" ? "stopped" : "running",
      lastEventAt: Date.now(),
    };
    this.sessions.set(event.session_id, record);
    return record;
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  list(): SessionRecord[] {
    return Array.from(this.sessions.values());
  }
}
