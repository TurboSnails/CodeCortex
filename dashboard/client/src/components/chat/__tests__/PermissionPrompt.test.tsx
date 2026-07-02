import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionPrompt } from "../PermissionPrompt";
import type { PermissionRequestEnvelope } from "../types";

const descriptionRequest: PermissionRequestEnvelope = {
  type: "permission_request",
  id: "p1",
  tool_name: "Bash",
  description: "List files",
};

describe("PermissionPrompt", () => {
  it("calls onApprove when Approve is clicked", () => {
    const onApprove = vi.fn();
    render(
      <PermissionPrompt
        request={descriptionRequest}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));
    expect(onApprove).toHaveBeenCalled();
  });

  it("calls onReject when Reject is clicked", () => {
    const onReject = vi.fn();
    render(
      <PermissionPrompt
        request={descriptionRequest}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));
    expect(onReject).toHaveBeenCalled();
  });

  it("disables both buttons when disabled is true", () => {
    render(
      <PermissionPrompt
        request={descriptionRequest}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        disabled
      />
    );
    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reject/i })).toBeDisabled();
  });

  it("renders the permission description when no tool_input is provided", () => {
    render(
      <PermissionPrompt
        request={descriptionRequest}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText("List files")).toBeInTheDocument();
  });

  it("renders structured Edit tool input with removed/added diff blocks", () => {
    const editRequest: PermissionRequestEnvelope = {
      type: "permission_request",
      id: "p2",
      tool_name: "Edit",
      tool_input: {
        file_path: "src/index.ts",
        old_string: "const a = 1;",
        new_string: "const a = 2;",
      },
    };

    const { container } = render(
      <PermissionPrompt
        request={editRequest}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getAllByText("src/index.ts").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(container.textContent).toContain("const a = 1;");
    expect(container.textContent).toContain("const a = 2;");
  });

  it("renders structured Bash tool input with the command block", () => {
    const bashRequest: PermissionRequestEnvelope = {
      type: "permission_request",
      id: "p3",
      tool_name: "Bash",
      tool_input: {
        command: "rm -rf node_modules",
        description: "Clean dependencies",
      },
    };

    render(
      <PermissionPrompt
        request={bashRequest}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("rm -rf node_modules")).toBeInTheDocument();
    expect(screen.getByText(/Clean dependencies/i)).toBeInTheDocument();
  });
});
