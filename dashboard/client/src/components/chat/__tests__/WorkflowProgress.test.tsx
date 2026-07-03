import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowProgress } from "../WorkflowProgress";

describe("WorkflowProgress", () => {
  it("renders steps for openspec", () => {
    render(<WorkflowProgress mode="openspec" currentStepId="propose" onCancel={vi.fn()} />);
    expect(screen.getByText("explore")).toBeInTheDocument();
    expect(screen.getByText("propose")).toBeInTheDocument();
    expect(screen.getByText("apply")).toBeInTheDocument();
    expect(screen.getByText("archive")).toBeInTheDocument();
  });

  it("highlights the current step", () => {
    render(<WorkflowProgress mode="openspec" currentStepId="apply" onCancel={vi.fn()} />);
    const current = screen.getByText("apply");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(<WorkflowProgress mode="openspec" currentStepId="explore" onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
