/* oxlint-disable react/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { sessionService } from "../services/sessionService";
import { subscribeRealtime } from "./useRealtime";
import type { ActivitySession, ActivitySessionInput, PomodoroSettings, SessionAnalytics } from "../types/sessions";

type SessionsContextValue = {
    sessions: ActivitySession[];
    activeSession: ActivitySession | null;
    pomodoroSettings: PomodoroSettings;
    loading: boolean;
    error: string;
    refreshSessions: () => Promise<void>;
    createSession: (input: ActivitySessionInput) => Promise<ActivitySession>;
    updateSession: (id: string, input: Partial<ActivitySessionInput>) => Promise<ActivitySession>;
    cancelSession: (id: string) => Promise<ActivitySession>;
    deleteSession: (id: string) => Promise<void>;
    getAnalytics: (start?: string, end?: string) => Promise<SessionAnalytics>;
    updatePomodoroSettings: (settings: PomodoroSettings) => Promise<PomodoroSettings>;
};

const defaultSettings: PomodoroSettings = { focusDuration: 1500, shortBreakDuration: 300, longBreakDuration: 900 };
const SessionsContext = createContext<SessionsContextValue | null>(null);

function activeFrom(sessions: ActivitySession[]) {
    return [...sessions].filter((session) => session.status === "running" || session.status === "paused").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] || null;
}

export function SessionsProvider({ children }: { children: ReactNode }) {
    const [sessions, setSessions] = useState<ActivitySession[]>([]);
    const [activeSession, setActiveSession] = useState<ActivitySession | null>(null);
    const [pomodoroSettings, setPomodoroSettings] = useState(defaultSettings);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const refreshSessions = useCallback(async () => {
        try {
            setError("");
            const [records, active, settings] = await Promise.all([sessionService.getSessions(), sessionService.getActiveSession(), sessionService.getPomodoroSettings()]);
            setSessions(records);
            setActiveSession(active || activeFrom(records));
            setPomodoroSettings(settings);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not load activity sessions");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { void refreshSessions(); }, [refreshSessions]);
    useEffect(() => subscribeRealtime((change) => { if (["all", "sessions", "partner"].includes(change.scope)) void refreshSessions(); }), [refreshSessions]);

    const value = useMemo<SessionsContextValue>(() => ({
        sessions,
        activeSession,
        pomodoroSettings,
        loading,
        error,
        refreshSessions,
        createSession: async (input) => {
            const session = await sessionService.createSession(input);
            setSessions((current) => current.some((item) => item.id === session.id) ? current.map((item) => item.id === session.id ? session : item) : [...current, session]);
            setActiveSession((current) => session.status === "running" || session.status === "paused" ? session : current);
            return session;
        },
        updateSession: async (id, input) => {
            const session = await sessionService.updateSession(id, input);
            setSessions((current) => current.map((item) => item.id === id ? session : item));
            setActiveSession((current) => session.status === "running" || session.status === "paused" ? session : (current?.id === id ? null : current));
            return session;
        },
        cancelSession: async (id) => {
            const session = await sessionService.cancelSession(id);
            setSessions((current) => current.map((item) => item.id === id ? session : item));
            setActiveSession((current) => current?.id === id ? null : current);
            return session;
        },
        deleteSession: async (id) => {
            await sessionService.deleteSession(id);
            setSessions((current) => current.filter((session) => session.id !== id));
            setActiveSession((current) => current?.id === id ? null : current);
        },
        getAnalytics: (start, end) => sessionService.getAnalytics(start, end),
        updatePomodoroSettings: async (settings) => {
            const updated = await sessionService.updatePomodoroSettings(settings);
            setPomodoroSettings(updated);
            return updated;
        },
    }), [activeSession, error, loading, pomodoroSettings, refreshSessions, sessions]);

    return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions() {
    const value = useContext(SessionsContext);
    if (!value) throw new Error("useSessions must be used inside SessionsProvider");
    return value;
}
