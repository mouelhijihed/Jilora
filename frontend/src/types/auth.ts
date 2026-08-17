import type { WorkoutType } from "./productivity";

export type UserPreferences = { student: boolean; gym: boolean; partTimeJob: boolean };
export type Presence = { online: boolean; status: "Online" | "Offline"; lastSeenAt: string | null };
export type AuthUser = { id: string; email: string; username: string; firstName: string; lastName: string; createdAt: string; updatedAt: string; preferences: UserPreferences; onboardingCompleted: boolean; timeZone: string; presence: Presence };
export type RegisterInput = { firstName: string; lastName: string; username: string; email: string; password: string; confirmPassword: string; timeZone?: string };
export type OnboardingInput = {
    preferences: UserPreferences;
    subjects?: Array<{ name: string; targetWeeklyHours: number; targetMonthlyHours: number; priority: "low" | "medium" | "high" | "critical"; color: string }>;
    workoutTemplate?: { name: string; recurring: boolean; startsOn: string; days: Array<{ dayOfWeek: number; workoutName: string; workoutType: WorkoutType; startTime: string; endTime: string; exercises: never[] }> } | null;
    job?: { jobName: string; company: string; hourlyTarget: number | null } | null;
};
