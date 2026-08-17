/* oxlint-disable react/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../services/api";
import { authService } from "../services/authService";
import type { AuthUser, OnboardingInput, RegisterInput, UserPreferences } from "../types/auth";

type AuthContextValue = {
    user: AuthUser | null;
    isAuthenticated: boolean;
    loading: boolean;
    login: (email: string, password: string) => Promise<AuthUser>;
    register: (input: RegisterInput) => Promise<AuthUser>;
    logout: () => Promise<void>;
    completeOnboarding: (input: OnboardingInput) => Promise<AuthUser>;
    updateProfile: (firstName: string, lastName: string, preferences: UserPreferences) => Promise<AuthUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const authenticatedUserId = user?.id;

    const refresh = useCallback(async () => {
        try { setUser((await authService.me()).user); }
        catch (error) { if (error instanceof ApiError && error.status === 401) setUser(null); else setUser(null); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => {
        const unauthenticated = () => setUser(null);
        window.addEventListener("auth:unauthorized", unauthenticated);
        return () => window.removeEventListener("auth:unauthorized", unauthenticated);
    }, []);

    useEffect(() => {
        if (!authenticatedUserId) return;
        let lastInteractionAt = Date.now();
        let lastHeartbeatAt = 0;
        let disposed = false;

        const heartbeat = async (force = false) => {
            const now = Date.now();
            if (document.visibilityState === "hidden") return;
            if (!force && now - lastInteractionAt > 90000) return;
            if (!force && now - lastHeartbeatAt < 25000) return;
            lastHeartbeatAt = now;
            try {
                const { presence } = await authService.heartbeat();
                if (!disposed) setUser((current) => current ? { ...current, presence } : current);
            } catch (error) {
                if (!disposed && error instanceof ApiError && error.status === 401) setUser(null);
            }
        };
        const active = () => { lastInteractionAt = Date.now(); void heartbeat(false); };
        const visible = () => { if (document.visibilityState === "visible") { lastInteractionAt = Date.now(); void heartbeat(true); } };

        window.addEventListener("pointerdown", active, { passive: true });
        window.addEventListener("keydown", active);
        window.addEventListener("focus", visible);
        document.addEventListener("visibilitychange", visible);
        const interval = window.setInterval(() => void heartbeat(false), 30000);
        void heartbeat(true);
        return () => {
            disposed = true;
            window.clearInterval(interval);
            window.removeEventListener("pointerdown", active);
            window.removeEventListener("keydown", active);
            window.removeEventListener("focus", visible);
            document.removeEventListener("visibilitychange", visible);
        };
    }, [authenticatedUserId]);

    const value = useMemo<AuthContextValue>(() => ({
        user,
        isAuthenticated: Boolean(user),
        loading,
        login: async (email, password) => { const next = (await authService.login(email, password)).user; setUser(next); return next; },
        register: async (input) => { const next = (await authService.register(input)).user; setUser(next); return next; },
        logout: async () => { await authService.logout(); setUser(null); },
        completeOnboarding: async (input) => { const next = (await authService.onboarding(input)).user; setUser(next); return next; },
        updateProfile: async (firstName, lastName, preferences) => { const next = (await authService.updateProfile(firstName, lastName, preferences)).user; setUser(next); return next; },
    }), [loading, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const value = useContext(AuthContext);
    if (!value) throw new Error("useAuth must be used inside AuthProvider");
    return value;
}
