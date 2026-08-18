import { apiRequest } from "./api";
import type { PartnerSettings, PartnerSharedData, PartnerState, SharedGoal } from "../types/partner";

export type GoalInput = { title: string; type: SharedGoal["type"]; target: number; manualProgress?: number; startDate: string; endDate: string };
export type EncouragementMessage = { id: string; message: string; enabled: boolean; createdAt: string; updatedAt: string };

function goalRequest(input: GoalInput) {
    return { ...input, target: input.type === "study_minutes" ? input.target * 60 : input.target };
}

function goalResponse(goal: SharedGoal): SharedGoal {
    if (goal.type !== "study_minutes") return goal;
    return {
        ...goal,
        target: goal.target / 60,
        progress: goal.progress / 60,
        contributors: goal.contributors.map((contributor) => ({ ...contributor, value: contributor.value === null ? null : contributor.value / 60 })),
    };
}

export const partnerService = {
    state: () => apiRequest<PartnerState>("/api/partners/me"),
    invite: (identifier: string) => apiRequest("/api/partners/invite", { method: "POST", body: JSON.stringify({ identifier }) }),
    accept: (id: string) => apiRequest(`/api/partners/invitations/${id}/accept`, { method: "POST" }),
    decline: (id: string) => apiRequest(`/api/partners/invitations/${id}/decline`, { method: "POST" }),
    cancelInvitation: (id: string) => apiRequest(`/api/partners/invitations/${id}/cancel`, { method: "POST" }),
    remove: () => apiRequest("/api/partners", { method: "DELETE" }),
    sharedData: () => apiRequest<PartnerSharedData>("/api/partners/shared-data"),
    settings: () => apiRequest<PartnerSettings>("/api/partners/settings"),
    updateSettings: (settings: Omit<PartnerSettings, "userId" | "partnershipId" | "createdAt" | "updatedAt">) => apiRequest<PartnerSettings>("/api/partners/settings", { method: "PUT", body: JSON.stringify(settings) }),
    goals: () => apiRequest<SharedGoal[]>("/api/partners/goals").then((goals) => goals.map(goalResponse)),
    createGoal: (input: GoalInput) => apiRequest<SharedGoal>("/api/partners/goals", { method: "POST", body: JSON.stringify(goalRequest(input)) }).then(goalResponse),
    updateGoal: (id: string, input: GoalInput) => apiRequest<SharedGoal>(`/api/partners/goals/${id}`, { method: "PUT", body: JSON.stringify(goalRequest(input)) }).then(goalResponse),
    deleteGoal: (id: string) => apiRequest(`/api/partners/goals/${id}`, { method: "DELETE" }),
    createSession: (subjectId: string | undefined, durationMinutes: number) => apiRequest("/api/partners/study-sessions", { method: "POST", body: JSON.stringify({ ...(subjectId ? { subjectId } : {}), durationMinutes }) }),
    sessionAction: (id: string, action: "join" | "decline" | "leave" | "pause" | "resume" | "complete" | "cancel") => apiRequest(`/api/partners/study-sessions/${id}/${action}`, { method: "POST" }),
    encourage: (message: string) => apiRequest("/api/partners/encouragement", { method: "POST", body: JSON.stringify({ message }) }),
    encouragements: () => apiRequest<{ defaults: string[]; custom: string[]; enabled: boolean }>("/api/encouragements"),
    encouragementManagement: () => apiRequest<{ settings: { enabled: boolean }; messages: EncouragementMessage[] }>("/api/encouragements/manage"),
    updateEncouragementSettings: (enabled: boolean) => apiRequest<{ enabled: boolean }>("/api/encouragements/settings", { method: "PUT", body: JSON.stringify({ enabled }) }),
    createEncouragement: (message: string) => apiRequest<EncouragementMessage>("/api/encouragements", { method: "POST", body: JSON.stringify({ message, enabled: true }) }),
    updateEncouragement: (id: string, message: string, enabled: boolean) => apiRequest<EncouragementMessage>(`/api/encouragements/${id}`, { method: "PUT", body: JSON.stringify({ message, enabled }) }),
    deleteEncouragement: (id: string) => apiRequest(`/api/encouragements/${id}`, { method: "DELETE" }),
    readNotification: (id: string) => apiRequest(`/api/partners/notifications/${id}/read`, { method: "POST" }),
    clearNotifications: () => apiRequest<void>("/api/partners/notifications", { method: "DELETE" }),
};
