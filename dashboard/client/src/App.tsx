/**
 * @file App.tsx
 * @description Defines the main application component that sets up routing for different pages, manages WebSocket connections for real-time updates, and initializes notifications. It uses React Router for navigation and custom hooks for WebSocket and notification handling.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { SplashScreen } from "./components/SplashScreen";
import { Dashboard } from "./pages/Dashboard";
import { KanbanBoard } from "./pages/KanbanBoard";
import { Sessions } from "./pages/Sessions";
import { SessionDetail } from "./pages/SessionDetail";
import { ActivityFeed } from "./pages/ActivityFeed";
import { Analytics } from "./pages/Analytics";
import { Workflows } from "./pages/Workflows";
import { Settings } from "./pages/Settings";
import { CcConfig } from "./pages/CcConfig";
import { Run } from "./pages/Run";
import { NotFound } from "./pages/NotFound";
import { useWebSocket } from "./hooks/useWebSocket";
import { useNotifications } from "./hooks/useNotifications";
import { eventBus } from "./lib/eventBus";
import { PlanningPrompt } from "./components/PlanningPrompt";
import { api } from "./lib/api";
import type { WSMessage, Session } from "./lib/types";

export default function App() {
  const [pendingPlanSession, setPendingPlanSession] = useState<Session | null>(null);
  const [planSubmitting, setPlanSubmitting] = useState(false);

  const onMessage = useCallback((msg: WSMessage) => {
    eventBus.publish(msg);
    if (msg.type === "session_created") {
      setPendingPlanSession(msg.data as Session);
    }
  }, []);

  const { connected } = useWebSocket(onMessage);
  useNotifications();

  // Dismiss prompt on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPendingPlanSession(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handlePlan(description: string) {
    if (!pendingPlanSession) return;
    setPlanSubmitting(true);
    try {
      await api.plan.create(pendingPlanSession.id, description);
    } finally {
      setPlanSubmitting(false);
      setPendingPlanSession(null);
    }
  }

  return (
    <>
      <SplashScreen />
      {pendingPlanSession && (
        <PlanningPrompt
          session={pendingPlanSession}
          onSkip={() => setPendingPlanSession(null)}
          onPlan={handlePlan}
          submitting={planSubmitting}
        />
      )}
      <BrowserRouter>
        <Routes>
          <Route element={<Layout wsConnected={connected} />}>
            <Route index element={<Dashboard />} />
            <Route path="kanban" element={<KanbanBoard />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:id" element={<SessionDetail />} />
            <Route path="activity" element={<ActivityFeed />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="workflows" element={<Workflows />} />
            <Route path="cc-config" element={<CcConfig />} />
            <Route path="run" element={<Run />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}
