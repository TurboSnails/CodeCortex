export type ChatMode = "normal" | "openspec" | "superpower" | "superflow";

export interface ChatModeOption {
  id: ChatMode;
  label: string;
}

export const CHAT_MODES: ChatModeOption[] = [
  { id: "normal", label: "普通" },
  { id: "openspec", label: "OpenSpec" },
  { id: "superpower", label: "Superpower" },
  { id: "superflow", label: "Superflow" },
];

export interface WorkflowStep {
  id: string;
  command: string;
}

const WORKFLOW_STEPS: Record<Exclude<ChatMode, "normal">, WorkflowStep[]> = {
  openspec: [
    { id: "explore", command: "/opsx:explore" },
    { id: "propose", command: "/opsx:propose" },
    { id: "apply", command: "/opsx:apply" },
    { id: "archive", command: "/opsx:archive" },
  ],
  superpower: [
    { id: "brainstorm", command: "/brainstorm" },
    { id: "write-plan", command: "/write-plan" },
    { id: "execute-plan", command: "/execute-plan" },
  ],
  superflow: [
    { id: "brainstorm", command: "/brainstorm" },
    { id: "propose", command: "/opsx:propose" },
    { id: "apply", command: "/opsx:apply" },
    { id: "archive", command: "/opsx:archive" },
  ],
};

export function getWorkflowSteps(mode: ChatMode): WorkflowStep[] {
  if (mode === "normal") return [];
  return WORKFLOW_STEPS[mode];
}

export function getNextCommand(mode: ChatMode, currentStepId: string): string | null {
  const steps = getWorkflowSteps(mode);
  const idx = steps.findIndex((s) => s.id === currentStepId);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1].command;
}

export function getPlaceholder(mode: ChatMode): string {
  switch (mode) {
    case "openspec":
      return "描述你想探索/变更的需求，我将按 OpenSpec 流程推进";
    case "superpower":
      return "描述你想实现的功能，我将按 brainstorm → plan → execute 推进";
    case "superflow":
      return "描述你想端到端交付的变更";
    default:
      return "Ask Claude…";
  }
}
