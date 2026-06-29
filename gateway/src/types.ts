export type HookEventName = "SessionStart" | "PreToolUse" | "PostToolUse" | "Stop";

export interface BaseHookEvent {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: HookEventName;
}

export interface SessionStartEvent extends BaseHookEvent {
  hook_event_name: "SessionStart";
  source: string;
}

export interface PreToolUseEvent extends BaseHookEvent {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface PostToolUseEvent extends BaseHookEvent {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
  tool_use_id: string;
  duration_ms: number;
}

export interface StopEvent extends BaseHookEvent {
  hook_event_name: "Stop";
  stop_hook_active: boolean;
  last_assistant_message: string;
}

export type HookEvent = SessionStartEvent | PreToolUseEvent | PostToolUseEvent | StopEvent;

export type SessionStatus = "running" | "stopped";

export interface SessionRecord {
  sessionId: string;
  cwd: string;
  status: SessionStatus;
  lastEventAt: number;
}
