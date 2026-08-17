export const eventTypes = ["gym", "study", "homework", "job", "general"] as const;

export type CalendarEventType = (typeof eventTypes)[number];

export type CalendarEventMetadata = Record<string, string | number | boolean | null>;

import type { Priority, WorkoutType } from "./productivity";

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

export type CalendarActivityDetails = {
    workoutType?: WorkoutType;
    subjectId?: string;
    subject?: string;
    priority?: Priority;
};

export type CalendarEventInput = Pick<CalendarEvent, "title" | "type" | "date" | "startTime" | "endTime" | "completed" | "notes"> & {
    activityDetails?: CalendarActivityDetails;
    metadata?: CalendarEventMetadata;
};

export type CalendarView = "month" | "week" | "day";
