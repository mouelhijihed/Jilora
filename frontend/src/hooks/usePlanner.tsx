/* oxlint-disable react/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { plannerService } from "../services/plannerService";
import { subscribeRealtime } from "./useRealtime";
import type { CalendarEvent, CalendarEventInput } from "../types/planner";

type PlannerContextValue = {
    events: CalendarEvent[];
    loading: boolean;
    error: string;
    createEvent: (input: CalendarEventInput) => Promise<CalendarEvent>;
    updateEvent: (id: string, input: CalendarEventInput) => Promise<CalendarEvent>;
    deleteEvent: (id: string) => Promise<void>;
    setEventCompleted: (id: string, completed: boolean) => Promise<CalendarEvent>;
    refreshEvents: (start?: string, end?: string) => Promise<void>;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const refreshEvents = useCallback(async (start?: string, end?: string) => {
        try {
            setError("");
            const records = await plannerService.getEvents(start, end);
            setEvents((current) => start && end
                ? [...current.filter((event) => event.date < start || event.date > end), ...records].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
                : records);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not load planner events");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refreshEvents(); }, [refreshEvents]);
    useEffect(() => subscribeRealtime((change) => { if (["all", "planner", "productivity", "workouts"].includes(change.scope)) void refreshEvents(); }), [refreshEvents]);

    const value = useMemo<PlannerContextValue>(() => ({
        events,
        loading,
        error,
        refreshEvents,
        createEvent: async (input) => {
            const event = await plannerService.saveEvent(input);
            setEvents((current) => (current.some((item) => item.id === event.id) ? current.map((item) => item.id === event.id ? event : item) : [...current, event]).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)));
            return event;
        },
        updateEvent: async (id, input) => {
            const event = await plannerService.updateEvent(id, input);
            setEvents((current) => current.map((item) => item.id === id ? event : item));
            return event;
        },
        deleteEvent: async (id) => {
            await plannerService.deleteEvent(id);
            setEvents((current) => current.filter((event) => event.id !== id));
        },
        setEventCompleted: async (id, completed) => {
            const event = await plannerService.setEventCompleted(id, completed);
            setEvents((current) => current.map((item) => item.id === id ? event : item));
            return event;
        },
    }), [error, events, loading, refreshEvents]);

    return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
    const value = useContext(PlannerContext);
    if (!value) throw new Error("usePlanner must be used inside PlannerProvider");
    return value;
}
