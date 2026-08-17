import { apiRequest } from "./api";
import type { HomeworkTask, HomeworkTaskInput, PartTimeJob, PartTimeJobInput, ProductivityData, StudySession, StudySessionInput, StudySubject, StudySubjectInput, WorkSession, WorkSessionInput, Workout, WorkoutAnalytics, WorkoutCompletionInput, WorkoutCompletionResult, WorkoutInput, WorkoutLog, WorkoutTemplate, WorkoutTemplateInput } from "../types/productivity";

function resource<T, TInput>(path: string) {
    return {
        create: (input: TInput) => apiRequest<T>(`/api/${path}`, { method: "POST", body: JSON.stringify(input) }),
        update: (id: string, input: TInput) => apiRequest<T>(`/api/${path}/${id}`, { method: "PUT", body: JSON.stringify(input) }),
        remove: (id: string) => apiRequest<void>(`/api/${path}/${id}`, { method: "DELETE" }),
    };
}

export const productivityService = {
    getData: () => apiRequest<Omit<ProductivityData, "workoutTemplates" | "workoutLogs">>("/api/productivity"),
    getWorkoutTemplates: () => apiRequest<WorkoutTemplate[]>("/api/workout-templates"),
    createWorkoutTemplate: (input: WorkoutTemplateInput) => apiRequest<WorkoutTemplate>("/api/workout-templates", { method: "POST", body: JSON.stringify(input) }),
    updateWorkoutTemplate: (id: string, input: WorkoutTemplateInput) => apiRequest<WorkoutTemplate>(`/api/workout-templates/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    deleteWorkoutTemplate: (id: string) => apiRequest<void>(`/api/workout-templates/${id}`, { method: "DELETE" }),
    getWorkoutSchedule: (start: string, end: string) => apiRequest<Workout[]>("/api/workout-schedule/materialize", { method: "POST", body: JSON.stringify({ start, end }) }),
    getWorkoutLogs: () => apiRequest<WorkoutLog[]>("/api/workout-logs"),
    completeWorkout: (id: string, input: WorkoutCompletionInput) => apiRequest<WorkoutCompletionResult>(`/api/workouts/${id}/complete`, { method: "POST", body: JSON.stringify(input) }),
    reopenWorkout: (id: string) => apiRequest<Workout>(`/api/workouts/${id}/reopen`, { method: "POST", body: "{}" }),
    getWorkoutAnalytics: (start?: string, end?: string) => {
        const query = start && end ? `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : "";
        return apiRequest<WorkoutAnalytics>(`/api/workouts/analytics${query}`);
    },
    subjects: resource<StudySubject, StudySubjectInput>("subjects"),
    studySessions: resource<StudySession, StudySessionInput>("study-sessions"),
    workouts: resource<Workout, WorkoutInput>("workouts"),
    savePartTimeJob: (input: PartTimeJobInput) => apiRequest<PartTimeJob>("/api/part-time-job", { method: "PUT", body: JSON.stringify(input) }),
    workSessions: resource<WorkSession, WorkSessionInput>("work-sessions"),
    homeworkTasks: resource<HomeworkTask, HomeworkTaskInput>("homework-tasks"),
};
