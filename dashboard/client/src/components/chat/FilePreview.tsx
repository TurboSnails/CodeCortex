/**
 * @file FilePreview.tsx
 * @description Read-only file preview for the right panel File tab in the
 * IDE-style /chat page.
 */

import { FileCode, AlertCircle } from "lucide-react";
import { CodeBlock } from "../conversation/CodeBlock";

interface FilePreviewProps {
  path: string | null;
  content: string | null;
  loading: boolean;
  error: string | null;
}

export function FilePreview({ path, content, loading, error }: FilePreviewProps) {
  if (!path) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 px-6 text-center">
        <FileCode className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm">Select a file from the Explorer to preview it here.</p>
      </div>
    );
  }

  const fileName = path.split("/").pop() || path;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-2/40">
        <FileCode className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[12px] font-mono text-gray-300 truncate">{path}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && (
          <div className="p-4 text-xs text-gray-500">Loading {fileName}...</div>
        )}
        {error && !loading && (
          <div className="p-4 flex items-start gap-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {content != null && !loading && (
          <CodeBlock code={content} lang={fileName} label={fileName} />
        )}
      </div>
    </div>
  );
}
