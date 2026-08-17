/* oxlint-disable react/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { productivityService } from "../services/productivityService";
import { usePlanner } from "./usePlanner";
import { subscribeRealtime } from "./useRealtime";
import type { HomeworkTask, HomeworkTaskInput, PartTimeJob, PartTimeJobInput, ProductivityData, StudySession, StudySessionInput, StudySubject, StudySubjectInput, WorkSession, WorkSessionInput, Workout, WorkoutCompletionInput, WorkoutCompletionResult, WorkoutInput, WorkoutTemplate, WorkoutTemplateInput } from "../types/productivity";

type ProductivityContextValue = ProductivityData & {
    loading: boolean;
    error: string;
    refreshData: () => Promise<void>;
    createSubject: (input: StudySubjectInput) => Promise<StudySubject>;
    updateSubject: (id: string, input: StudySubjectInput) => Promise<StudySubject>;
    deleteSubject: (id: string) => Promise<void>;
    createStudySession: (input: StudySessionInput) => Promise<StudySession>;
    updateStudySession: (id: string, input: StudySessionInput) => Promise<StudySession>;
    deleteStudySession: (id: string) => Promise<void>;
    createWorkout: (input: WorkoutInput) => Promise<Workout>;
    updateWorkout: (id: string, input: WorkoutInput) => Promise<Workout>;
    deleteWorkout: (id: string) => Promise<void>;
    createWorkoutTemplate: (input: WorkoutTemplateInput) => Promise<WorkoutTemplate>;
    updateWorkoutTemplate: (id: string, input: WorkoutTemplateInput) => Promise<WorkoutTemplate>;
    deleteWorkoutTemplate: (id: string) => Promise<void>;
    ensureWorkoutSchedule: (start: string, end: string) => Promise<Workout[]>;
    completeWorkout: (id: string, input: WorkoutCompletionInput) => Promise<WorkoutCompletionResult>;
    reopenWorkout: (id: string) => Promise<Workout>;
    savePartTimeJob: (input: PartTimeJobInput) => Promise<PartTimeJob>;
    createWorkSession: (input: WorkSessionInput) => Promise<WorkSession>;
    updateWorkSession: (id: string, input: WorkSessionInput) => Promise<WorkSession>;
    deleteWorkSession: (id: string) => Promise<void>;
    createHomeworkTask: (input: HomeworkTaskInput) => Promise<HomeworkTask>;
    updateHomeworkTask: (id: string, input: HomeworkTaskInput) => Promise<HomeworkTask>;
    deleteHomeworkTask: (id: string) => Promise<void>;
};

const emptyData: ProductivityData = { subjects: [], studySessions: [], workouts: [], partTimeJob: null, workSessions: [], homeworkTasks: [], workoutTemplates: [], workoutLogs: [] };
const ProductivityContext = createContext<ProductivityContextValue | null>(null);

export function ProductivityProvider({ children }: { children: ReactNode }) {
    const [data, setData] = useState<ProductivityData>(emptyData);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const { refreshEvents } = usePlanner();

    const refreshData = useCallback(async () => {
        try {
            setError("");
            const [productivity, workoutTemplates, workoutLogs] = await Promise.all([
                productivityService.getData(),
                productivityService.getWorkoutTemplates(),
                productivityService.getWorkoutLogs(),
            ]);
            setData({ ...productivity, workoutTemplates, workoutLogs });
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not load productivity data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refreshData(); }, [refreshData]);
    useEffect(() => subscribeRealtime((change) => { if (["all", "productivity", "workouts"].includes(change.scope)) void refreshData(); }), [refreshData]);

    const syncPlanner = useCallback(() => refreshEvents(), [refreshEvents]);
    const ensureWorkoutSchedule = useCallback(async (start: string, end: string) => {
        const workouts = await productivityService.getWorkoutSchedule(start, end);
        setData((current) => {
            const outsideRange = current.workouts.filter((workout) => workout.date < start || workout.date > end);
            return { ...current, workouts: [...outsideRange, ...workouts].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)) };
        });
        await refreshEvents(start, end, false);
        return workouts;
    }, [refreshEvents]);

    const value = useMemo<ProductivityContextValue>(() => ({
        ...data,
        loading,
        error,
        refreshData,
        createSubject: async (input) => {
            const item = await productivityService.subjects.create(input);
            setData((current) => ({ ...current, subjects: current.subjects.some((subject) => subject.id === item.id) ? current.subjects.map((subject) => subject.id === item.id ? item : subject) : [...current.subjects, item] }));
            return item;
        },
        updateSubject: async (id, input) => {
            const item = await productivityService.subjects.update(id, input);
            setData((current) => ({ ...current, subjects: current.subjects.map((subject) => subject.id === id ? item : subject) }));
            return item;
        },
        deleteSubject: async (id) => {
            await productivityService.subjects.remove(id);
            setData((current) => ({ ...current, subjects: current.subjects.filter((subject) => subject.id !== id) }));
        },
        createStudySession: async (input) => {
            const item = await productivityService.studySessions.create(input);
            setData((current) => ({ ...current, studySessions: current.studySessions.some((session) => session.id === item.id) ? current.studySessions.map((session) => session.id === item.id ? item : session) : [...current.studySessions, item] }));
            await syncPlanner();
            return item;
        },
        updateStudySession: async (id, input) => {
            const item = await productivityService.studySessions.update(id, input);
            setData((current) => ({ ...current, studySessions: current.studySessions.map((session) => session.id === id ? item : session) }));
            await syncPlanner();
            return item;
        },
        deleteStudySession: async (id) => {
            await productivityService.studySessions.remove(id);
            setData((current) => ({ ...current, studySessions: current.studySessions.filter((session) => session.id !== id) }));
            await syncPlanner();
        },
        createWorkout: async (input) => {
            const item = await productivityService.workouts.create(input);
            setData((current) => ({ ...current, workouts: current.workouts.some((workout) => workout.id === item.id) ? current.workouts.map((workout) => workout.id === item.id ? item : workout) : [...current.workouts, item] }));
            await syncPlanner();
            return item;
        },
        updateWorkout: async (id, input) => {
            const item = await productivityService.workouts.update(id, input);
            setData((current) => ({ ...current, workouts: current.workouts.map((workout) => workout.id === id ? item : workout) }));
            await syncPlanner();
            return item;
        },
        deleteWorkout: async (id) => {
            await productivityService.workouts.remove(id);
            setData((current) => ({ ...current, workouts: current.workouts.filter((workout) => workout.id !== id) }));
            await syncPlanner();
        },
        createWorkoutTemplate: async (input) => {
            const template = await productivityService.createWorkoutTemplate(input);
            await refreshData();
            await syncPlanner();
            return template;
        },
        updateWorkoutTemplate: async (id, input) => {
            const template = await productivityService.updateWorkoutTemplate(id, input);
            await refreshData();
            await syncPlanner();
            return template;
        },
        deleteWorkoutTemplate: async (id) => {
            await productivityService.deleteWorkoutTemplate(id);
            await refreshData();
            await syncPlanner();
        },
        ensureWorkoutSchedule,
        completeWorkout: async (id, input) => {
            const result = await productivityService.completeWorkout(id, input);
            setData((current) => ({
                ...current,
                workouts: current.workouts.map((workout) => workout.id === id ? result.workout : workout),
                workoutLogs: current.workoutLogs.some((log) => log.id === result.log.id) ? current.workoutLogs.map((log) => log.id === result.log.id ? result.log : log) : [...current.workoutLogs, result.log],
            }));
            await syncPlanner();
            return result;
        },
        reopenWorkout: async (id) => {
            const workout = await productivityService.reopenWorkout(id);
            setData((current) => ({
                ...current,
                workouts: current.workouts.map((item) => item.id === id ? workout : item),
                workoutLogs: current.workoutLogs.filter((log) => log.scheduledWorkoutId !== id),
            }));
            await syncPlanner();
            return workout;
        },
        savePartTimeJob: async (input) => {
            const item = await productivityService.savePartTimeJob(input);
            setData((current) => ({ ...current, partTimeJob: item }));
            return item;
        },
        createWorkSession: async (input) => {
            const item = await productivityService.workSessions.create(input);
            setData((current) => ({ ...current, workSessions: current.workSessions.some((session) => session.id === item.id) ? current.workSessions.map((session) => session.id === item.id ? item : session) : [...current.workSessions, item] }));
            await syncPlanner();
            return item;
        },
        updateWorkSession: async (id, input) => {
            const item = await productivityService.workSessions.update(id, input);
            setData((current) => ({ ...current, workSessions: current.workSessions.map((session) => session.id === id ? item : session) }));
            await syncPlanner();
            return item;
        },
        deleteWorkSession: async (id) => {
            await productivityService.workSessions.remove(id);
            setData((current) => ({ ...current, workSessions: current.workSessions.filter((session) => session.id !== id) }));
            await syncPlanner();
        },
        createHomeworkTask: async (input) => {
            const item = await productivityService.homeworkTasks.create(input);
            setData((current) => ({ ...current, homeworkTasks: current.homeworkTasks.some((task) => task.id === item.id) ? current.homeworkTasks.map((task) => task.id === item.id ? item : task) : [...current.homeworkTasks, item] }));
            await syncPlanner();
            return item;
        },
        updateHomeworkTask: async (id, input) => {
            const item = await productivityService.homeworkTasks.update(id, input);
            setData((current) => ({ ...current, homeworkTasks: current.homeworkTasks.map((task) => task.id === id ? item : task) }));
            await syncPlanner();
            return item;
        },
        deleteHomeworkTask: async (id) => {
            await productivityService.homeworkTasks.remove(id);
            setData((current) => ({ ...current, homeworkTasks: current.homeworkTasks.filter((task) => task.id !== id) }));
            await syncPlanner();
        },
    }), [data, ensureWorkoutSchedule, error, loading, refreshData, syncPlanner]);

    return <ProductivityContext.Provider value={value}>{children}</ProductivityContext.Provider>;
}

export function useProductivity() {
    const value = useContext(ProductivityContext);
    if (!value) throw new Error("useProductivity must be used inside ProductivityProvider");
    return value;
}
