/**
 * @file Chat.tsx
 * @description Top-level interactive Claude Code chat page. Lets the user pick
 * a working directory and start a fresh conversation using the same chat UI
 * that appears inside session detail.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import { api } from "../lib/api";
import type { CwdSuggestion } from "../lib/api";
import { ChatTab } from "../components/chat/ChatTab";

export function Chat() {
  const { t } = useTranslation(["sessions", "run"]);
  const sessionId = useMemo(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `chat-${Date.now()}`;
  }, []);

  const [cwd, setCwd] = useState("");
  const [cwds, setCwds] = useState<CwdSuggestion[]>([]);

  useEffect(() => {
    api.run
      .cwds()
      .then((res) => {
        setCwds(res.items);
        const first = res.items[0];
        if (first) {
          setCwd((current) => current || first.path);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] lg:h-[calc(100vh-6rem)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100 flex items-center gap-2">
            <MessageSquare className="w-6 h-6" />
            {t("chat.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("chat.startHint")}
          </p>
        </div>
        <div className="min-w-[16rem]">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            {t("run:fields.cwd")}
          </label>
          <select
            className="input w-full text-sm"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
          >
            {cwds.map((item) => (
              <option key={item.path} value={item.path}>
                {item.path}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {cwd ? <ChatTab sessionId={sessionId} cwd={cwd} className="h-full" /> : null}
      </div>
    </div>
  );
}
