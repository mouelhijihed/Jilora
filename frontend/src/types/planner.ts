export const eventTypes = ["gym", "study", "homework", "internship", "general"] as const;

export type CalendarEventType = (typeof eventTypes)[number];

export type CalendarEventMetadata = Record<string, string | number | boolean | null>;

export type CalendarEvent = {
    id: string;
    title: string;
    type: CalendarEventType;
    date: string;
    startTime: string;
    endTime: string;
    duration: number;
    completed: boolean;
    notes: string;
    metadata: CalendarEventMetadata;
    createdAt: string;
    updatedAt: string;
};

export type CalendarEventInput = Omit<CalendarEvent, "id" | "duration" | "createdAt" | "updatedAt">;

export type CalendarView = "month" | "week" | "day";
