/**
 * @file types.ts
 * @description Shared stream-json envelope types for the interactive chat subsystem.
 * Extracted from Run.tsx so the /run page and SessionDetail chat tab can share
 * the same streaming envelope state machine.
 */

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

export interface AssistantMessage {
  type: "assistant";
  message?: {
    content?: ContentBlock[] | string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

export interface UserMessage {
  type: "user";
  message?: { content?: ContentBlock[] | string };
}

export interface SystemInitEnvelope {
  type: "system";
  subtype: "init";
  session_id?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
  permissionMode?: string;
}

export interface ResultEnvelope {
  type: "result";
  subtype?: string;
  is_error?: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface PermissionRequestEnvelope {
  type: "permission_request";
  id: string;
  tool_name: string;
  /** Structured tool input captured from the pending `tool_use` envelope. */
  tool_input?: unknown;
  /** Text fallback when no pending `tool_use` was captured. */
  description?: string;
  command?: string;
  path?: string;
}

export type Envelope =
  | AssistantMessage
  | UserMessage
  | SystemInitEnvelope
  | ResultEnvelope
  | PermissionRequestEnvelope
  | { type: string; [k: string]: unknown };

export interface StreamEventEnvelope {
  type: "stream_event";
  event?: {
    type: string;
    index?: number;
    delta?: {
      type: string;
      text?: string;
      thinking?: string;
      partial_json?: string;
    };
    content_block?: {
      type: string;
      text?: string;
      thinking?: string;
      id?: string;
      name?: string;
      input?: unknown;
    };
    message?: { id?: string };
  };
}

export type StreamingAssistantBlock = ContentBlock & {
  _partialJson?: string;
};

export interface StreamingAssistantMessage {
  type: "assistant";
  _streamId?: string;
  message: {
    id?: string;
    content: StreamingAssistantBlock[];
    _streaming?: boolean;
  };
}
