import { ShieldAlert, Check, X } from "lucide-react";
import type { PermissionRequestEnvelope } from "./types";

export function PermissionPrompt({
  request,
  onApprove,
  onReject,
  disabled,
}: {
  request: PermissionRequestEnvelope;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/10 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-amber-200 font-medium">
        <ShieldAlert className="w-4 h-4 flex-shrink-0" />
        Permission request
      </div>
      <div className="text-sm text-gray-200">{request.description}</div>
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 px-3 py-2.5 md:py-1.5 text-xs font-medium disabled:opacity-40 min-h-[44px]"
        >
          <Check className="w-3.5 h-3.5" />
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 px-3 py-2.5 md:py-1.5 text-xs font-medium disabled:opacity-40 min-h-[44px]"
        >
          <X className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}
