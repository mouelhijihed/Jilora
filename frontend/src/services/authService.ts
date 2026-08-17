import { apiRequest } from "./api";
import type { AuthUser, OnboardingInput, Presence, RegisterInput, UserPreferences } from "../types/auth";

type UserResponse = { user: AuthUser };

export const authService = {
    me: () => apiRequest<UserResponse>("/api/auth/me"),
    register: (input: RegisterInput) => apiRequest<UserResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),
    login: (email: string, password: string) => apiRequest<UserResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    logout: () => apiRequest<void>("/api/auth/logout", { method: "POST", body: "{}" }),
    heartbeat: () => apiRequest<{ presence: Presence }>("/api/auth/heartbeat", { method: "POST", body: "{}" }),
    onboarding: (input: OnboardingInput) => apiRequest<UserResponse>("/api/auth/onboarding", { method: "POST", body: JSON.stringify(input) }),
    updateProfile: (firstName: string, lastName: string, preferences: UserPreferences) => apiRequest<UserResponse>("/api/auth/profile", { method: "PUT", body: JSON.stringify({ firstName, lastName, preferences }) }),
};
