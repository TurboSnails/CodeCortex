import { describe, it, expect } from "vitest";
import {
  CHAT_MODES,
  getWorkflowSteps,
  getNextCommand,
  getPlaceholder,
} from "../workflowConfig";

describe("workflowConfig", () => {
  it("lists four modes", () => {
    expect(CHAT_MODES).toHaveLength(4);
    expect(CHAT_MODES.map((m) => m.id)).toEqual(["normal", "openspec", "superpower", "superflow"]);
  });

  it("returns OpenSpec steps", () => {
    const steps = getWorkflowSteps("openspec");
    expect(steps.map((s) => s.id)).toEqual(["explore", "propose", "apply", "archive"]);
  });

  it("returns Superflow steps", () => {
    const steps = getWorkflowSteps("superflow");
    expect(steps.map((s) => s.id)).toEqual(["brainstorm", "propose", "apply", "archive"]);
  });

  it("looks up the next command", () => {
    expect(getNextCommand("openspec", "explore")).toBe("/opsx:propose");
    expect(getNextCommand("openspec", "archive")).toBeNull();
    expect(getNextCommand("superpower", "brainstorm")).toBe("/write-plan");
  });

  it("returns a placeholder string for every mode", () => {
    CHAT_MODES.forEach((mode) => {
      expect(typeof getPlaceholder(mode.id)).toBe("string");
    });
  });
});
