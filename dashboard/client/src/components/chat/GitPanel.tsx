/**
 * @file GitPanel.tsx
 * @description Git status / diff / stage / commit panel for the IDE-style /chat
 * page. Lives in the right panel Git tab or the left sidebar Git view.
 */

import { useState } from "react";
import { GitBranch, Plus, Minus, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import type { GitStatusResponse, GitDiffResponse } from "../../lib/api";

interface GitPanelProps {
  cwd: string;
  status: GitStatusResponse | null;
  diff: GitDiffResponse | null;
  loading: boolean;
  diffLoading: boolean;
  error: string | null;
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
  onStage: (file?: string) => Promise<void>;
  onUnstage: (file?: string) => Promise<void>;
  onCommit: (message: string) => Promise<void>;
  onPush: () => Promise<void>;
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("+")) {
    return <div className="pl-2 bg-emerald-500/10 text-emerald-200 font-mono text-[11px]">{line}</div>;
  }
  if (line.startsWith("-")) {
    return <div className="pl-2 bg-red-500/10 text-red-200 font-mono text-[11px]">{line}</div>;
  }
  return <div className="pl-2 text-gray-400 font-mono text-[11px]">{line}</div>;
}

function FileRow({
  file,
  status,
  selected,
  staged,
  onSelect,
  onStage,
  onUnstage,
}: {
  file: string;
  status: string;
  selected: boolean;
  staged: boolean;
  onSelect: (f: string) => void;
  onStage: (f: string) => void;
  onUnstage: (f: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 text-[12px] cursor-pointer ${
        selected ? "bg-accent/15" : "hover:bg-surface-2"
      }`}
      onClick={() => onSelect(file)}
    >
      <span
        className={`font-mono text-[10px] w-4 flex-shrink-0 ${
          status === "?" || status === "A" ? "text-emerald-400" : status === "M" ? "text-amber-400" : "text-gray-500"
        }`}
      >
        {status}
      </span>
      <span className="flex-1 truncate text-gray-300">{file}</span>
      {staged ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnstage(file);
          }}
          className="text-gray-500 hover:text-gray-300 p-0.5"
          title="Unstage"
        >
          <Minus className="w-3 h-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStage(file);
          }}
          className="text-gray-500 hover:text-gray-300 p-0.5"
          title="Stage"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function GitPanel({
  cwd,
  status,
  diff,
  loading,
  diffLoading,
  error,
  selectedFile,
  onSelectFile,
  onStage,
  onUnstage,
  onCommit,
  onPush,
}: GitPanelProps) {
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [showPushConfirm, setShowPushConfirm] = useState(false);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      await onCommit(commitMessage);
      setCommitMessage("");
    } finally {
      setCommitting(false);
    }
  };

  const handlePush = async () => {
    setShowPushConfirm(false);
    setPushing(true);
    try {
      await onPush();
    } finally {
      setPushing(false);
    }
  };

  if (loading && !status) {
    return <div className="p-4 text-xs text-gray-500">Loading Git status...</div>;
  }

  if (error) {
    return (
      <div className="p-4 flex items-start gap-2 text-xs text-red-300">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 px-6 text-center">
        <GitBranch className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm">Git status will appear here.</p>
      </div>
    );
  }

  const hasChanges =
    status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0;

  return (
    <div className="h-full flex flex-col text-[12px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-2/40">
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-mono text-gray-300">{status.branch || "(no branch)"}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowPushConfirm(true)}
          disabled={pushing}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-surface-3 text-gray-300 disabled:opacity-50"
        >
          <Upload className="w-3 h-3" />
          {pushing ? "Pushing..." : "Push"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {!hasChanges && (
          <div className="p-4 text-gray-500 text-center">No changes</div>
        )}

        {status.staged.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
              <span>Staged Changes</span>
              <button
                type="button"
                onClick={() => onUnstage()}
                className="text-gray-500 hover:text-gray-300"
              >
                <Minus className="w-3 h-3" />
              </button>
            </div>
            {status.staged.map((s) => (
              <FileRow
                key={s.file}
                file={s.file}
                status={s.status}
                selected={selectedFile === s.file}
                staged
                onSelect={onSelectFile}
                onStage={onStage}
                onUnstage={onUnstage}
              />
            ))}
          </div>
        )}

        {(status.unstaged.length > 0 || status.untracked.length > 0) && (
          <div className="mb-2">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
              <span>Changes</span>
              <button
                type="button"
                onClick={() => onStage()}
                className="text-gray-500 hover:text-gray-300"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            {status.unstaged.map((s) => (
              <FileRow
                key={s.file}
                file={s.file}
                status={s.status}
                selected={selectedFile === s.file}
                staged={false}
                onSelect={onSelectFile}
                onStage={onStage}
                onUnstage={onUnstage}
              />
            ))}
            {status.untracked.map((file) => (
              <FileRow
                key={file}
                file={file}
                status="?"
                selected={selectedFile === file}
                staged={false}
                onSelect={onSelectFile}
                onStage={onStage}
                onUnstage={onUnstage}
              />
            ))}
          </div>
        )}

        {selectedFile && (diffLoading || diff) && (
          <div className="border-t border-border">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Diff: {selectedFile}
            </div>
            {diffLoading && <div className="px-3 py-2 text-xs text-gray-500">Loading diff...</div>}
            {diff && (
              <div className="font-mono whitespace-pre-wrap break-words">
                {diff.diff.split("\n").map((line, i) => (
                  <DiffLine key={i} line={line} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {status.staged.length > 0 && (
        <div className="border-t border-border p-2 space-y-2">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message"
            className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-[12px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-accent/50"
          />
          <button
            type="button"
            onClick={handleCommit}
            disabled={!commitMessage.trim() || committing}
            className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
          >
            <CheckCircle2 className="w-3 h-3" />
            {committing ? "Committing..." : "Commit"}
          </button>
        </div>
      )}

      {showPushConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface-1 p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-100 mb-2">Push changes?</h3>
            <p className="text-xs text-gray-400 mb-4">
              This will run <code className="text-gray-300">git push</code> in
              <br />
              <span className="font-mono">{cwd}</span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPushConfirm(false)}
                className="px-3 py-1.5 rounded text-[11px] text-gray-300 hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePush}
                className="px-3 py-1.5 rounded text-[11px] bg-accent text-white hover:bg-accent/90"
              >
                Push
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
