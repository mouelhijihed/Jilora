export type SessionActivity = "study" | "homework" | "internship" | "gym";
export type SessionStatus = "running" | "paused" | "completed" | "cancelled";
export type SessionType = "focus" | "shortBreak" | "longBreak" | "activity";

export type ActivitySession = {
    id: string;
    activity: SessionActivity;
    subjectId: string;
    subject: string;
    topic: string;
    plannedDuration: number;
    actualDuration: number;
    duration: number;
    status: SessionStatus;
    sessionType: SessionType;
    pomodoroNumber: number;
    startedAt: string;
    activeStartedAt: string | null;
    completedAt: string | null;
    workoutId?: string;
    createdAt: string;
    updatedAt: string;
};

export type ActivitySessionInput = {
    activity: SessionActivity;
    subjectId?: string;
    subject?: string;
    topic?: string;
    plannedDuration: number;
    actualDuration?: number;
    status?: SessionStatus;
    sessionType?: SessionType;
    pomodoroNumber?: number;
    startedAt?: string;
    activeStartedAt?: string | null;
    completedAt?: string | null;
};

export type PomodoroSettings = {
    focusDuration: number;
    shortBreakDuration: number;
    longBreakDuration: number;
};

export type SessionAnalytics = {
    start: string;
    end: string;
    totalStudyDuration: number;
    completedPomodoros: number;
    averagePomodoroDuration: number;
    bySubject: Array<{ subject: string; actualDuration: number }>;
    byDay: Array<{ date: string; actualDuration: number }>;
    activityTotals: Partial<Record<SessionActivity, number>>;
    completedSessions: number;
};
