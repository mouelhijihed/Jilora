export type Priority = "low" | "medium" | "high" | "critical";
export type HomeworkStatus = "todo" | "in-progress" | "completed";
export type WorkoutType = "Push" | "Pull" | "Legs" | "Upper" | "Lower" | "Full Body" | "Cardio" | "Rest";

export type WorkoutExercise = {
    id: string;
    name: string;
    sets: number;
    reps: string;
    notes: string;
};

export type WorkoutTemplateDay = {
    id: string;
    dayOfWeek: number;
    workoutName: string;
    workoutType: WorkoutType;
    startTime: string;
    endTime: string;
    plannedMinutes: number;
    exercises: WorkoutExercise[];
};

type PersistedRecord = {
    id: string;
    createdAt: string;
    updatedAt: string;
};

type ScheduledRecord = PersistedRecord & {
    eventId: string;
    date: string;
    startTime: string;
    endTime: string;
    plannedMinutes: number;
    completed: boolean;
    completedAt: string | null;
    notes: string;
};

export type StudySubject = PersistedRecord & {
    name: string;
    targetWeeklyHours: number;
    targetMonthlyHours: number;
    priority: Priority;
    color: string;
};

export type StudySession = ScheduledRecord & {
    subjectId: string;
    actualMinutes: number;
};

export type Workout = ScheduledRecord & {
    name: string;
    workoutType: WorkoutType;
    actualMinutes?: number;
    status?: "planned" | "completed" | "cancelled";
    templateId?: string;
    scheduleId?: string;
    source?: "recurring";
    exercises?: WorkoutExercise[];
};

export type WorkoutTemplate = PersistedRecord & {
    name: string;
    recurring: boolean;
    startsOn: string;
    days: WorkoutTemplateDay[];
};

export type WorkoutLogSet = {
    reps: number;
    weight: number;
};

export type WorkoutLogExercise = {
    name: string;
    sets: WorkoutLogSet[];
};

export type WorkoutLog = {
    id: string;
    scheduledWorkoutId: string;
    startedAt: string;
    completedAt: string;
    duration: number;
    exercises: WorkoutLogExercise[];
    notes: string;
};

export type WorkoutPeriodStats = {
    planned: number;
    completed: number;
    missed: number;
    completionRate: number;
    plannedMinutes: number;
    actualMinutes: number;
    totalWorkoutTimeMinutes: number;
};

export type WorkoutAnalytics = {
    range: WorkoutPeriodStats;
    thisWeek: WorkoutPeriodStats;
    lastWeek: WorkoutPeriodStats;
    thisMonth: WorkoutPeriodStats;
    overall: WorkoutPeriodStats;
    byWorkout: Array<{ name: string } & WorkoutPeriodStats>;
};

export type InternshipDay = ScheduledRecord & {
    internshipName: string;
    actualMinutes: number;
    tasksCompleted: string[];
};

export type HomeworkTask = PersistedRecord & {
    eventId: string;
    title: string;
    subject: string;
    description: string;
    dueDate: string;
    dueTime: string;
    priority: Priority;
    estimatedMinutes: number;
    status: HomeworkStatus;
    completedDate: string | null;
    completedAt: string | null;
};

export type ProductivityData = {
    subjects: StudySubject[];
    studySessions: StudySession[];
    workouts: Workout[];
    internshipDays: InternshipDay[];
    homeworkTasks: HomeworkTask[];
    workoutTemplates: WorkoutTemplate[];
    workoutLogs: WorkoutLog[];
};

export type StudySubjectInput = Pick<StudySubject, "name" | "targetWeeklyHours" | "targetMonthlyHours" | "priority" | "color">;
export type StudySessionInput = Pick<StudySession, "subjectId" | "date" | "startTime" | "endTime" | "actualMinutes" | "completed" | "notes">;
export type WorkoutInput = Pick<Workout, "name" | "workoutType" | "date" | "startTime" | "endTime" | "completed" | "notes">;
export type WorkoutTemplateInput = Pick<WorkoutTemplate, "name" | "recurring" | "days"> & { startsOn?: string };
export type WorkoutCompletionInput = {
    durationMinutes: number;
    startedAt?: string;
    exercises: WorkoutLogExercise[];
    notes: string;
};
export type WorkoutCompletionResult = { workout: Workout; log: WorkoutLog };
export type InternshipDayInput = Pick<InternshipDay, "internshipName" | "date" | "startTime" | "endTime" | "actualMinutes" | "completed" | "notes" | "tasksCompleted">;
export type HomeworkTaskInput = Pick<HomeworkTask, "title" | "subject" | "description" | "dueDate" | "dueTime" | "priority" | "estimatedMinutes" | "status" | "completedDate">;
