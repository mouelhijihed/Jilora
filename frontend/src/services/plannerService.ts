import { apiRequest } from "./api";
import type { CalendarEvent, CalendarEventInput } from "../types/planner";

export const plannerService = {
    getEvents: async (start?: string, end?: string) => {
        const query = start && end ? `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : "";
        return apiRequest<CalendarEvent[]>(`/api/events${query}`);
    },
    saveEvent: (event: CalendarEventInput) => apiRequest<CalendarEvent>("/api/events", { method: "POST", body: JSON.stringify(event) }),
    updateEvent: (id: string, event: CalendarEventInput) => apiRequest<CalendarEvent>(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(event) }),
    setEventCompleted: (id: string, completed: boolean) => apiRequest<CalendarEvent>(`/api/events/${id}/completed`, { method: "PATCH", body: JSON.stringify({ completed }) }),
    deleteEvent: (id: string) => apiRequest<void>(`/api/events/${id}`, { method: "DELETE" }),
};
