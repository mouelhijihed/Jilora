/* oxlint-disable react/only-export-components */
import { useEffect } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./useAuth";

export type RealtimeChange = { scope: string; occurredAt: string; method?: string };

function announce(change: RealtimeChange) {
    window.dispatchEvent(new CustomEvent<RealtimeChange>("realtime:refresh", { detail: change }));
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;
        const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
            withCredentials: true,
            reconnection: true,
        });
        let connectedOnce = false;
        socket.on("connect", () => {
            if (connectedOnce) announce({ scope: "all", occurredAt: new Date().toISOString() });
            connectedOnce = true;
        });
        socket.on("state:changed", (change: RealtimeChange) => announce(change));
        return () => { socket.removeAllListeners(); socket.disconnect(); };
    }, [user]);

    return children;
}

export function subscribeRealtime(listener: (change: RealtimeChange) => void) {
    const handler = (event: Event) => listener((event as CustomEvent<RealtimeChange>).detail);
    window.addEventListener("realtime:refresh", handler);
    return () => window.removeEventListener("realtime:refresh", handler);
}
