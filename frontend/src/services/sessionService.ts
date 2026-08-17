import { apiRequest } from "./api";
import type { ActivitySession, ActivitySessionInput, PomodoroSettings, SessionAnalytics } from "../types/sessions";

function queryString(query: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
    const value = params.toString();
    return value ? `?${value}` : "";
}

export const sessionService = {
    getSessions: (query: { activity?: string; subject?: string; start?: string; end?: string; status?: string } = {}) => apiRequest<ActivitySession[]>(`/api/sessions${queryString(query)}`),
    getActiveSession: () => apiRequest<ActivitySession | null>("/api/sessions/active"),
    createSession: (input: ActivitySessionInput) => apiRequest<ActivitySession>("/api/sessions", { method: "POST", body: JSON.stringify(input) }),
    updateSession: (id: string, input: Partial<ActivitySessionInput>) => apiRequest<ActivitySession>(`/api/sessions/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    cancelSession: (id: string) => apiRequest<ActivitySession>(`/api/sessions/${id}/cancel`, { method: "POST" }),
    deleteSession: (id: string) => apiRequest<void>(`/api/sessions/${id}`, { method: "DELETE" }),
    getAnalytics: (start?: string, end?: string) => apiRequest<SessionAnalytics>(`/api/sessions/analytics${queryString({ start, end })}`),
    getPomodoroSettings: () => apiRequest<PomodoroSettings>("/api/pomodoro-settings"),
    updatePomodoroSettings: (settings: PomodoroSettings) => apiRequest<PomodoroSettings>("/api/pomodoro-settings", { method: "PUT", body: JSON.stringify(settings) }),
};
