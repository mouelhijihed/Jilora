import { useEffect, useMemo, useState } from "react";
import { WorkoutEditor } from "../components/gym/WorkoutEditor";
import { WorkoutLogEditor } from "../components/gym/WorkoutLogEditor";
import { WorkoutTemplateEditor } from "../components/gym/WorkoutTemplateEditor";
import { WeeklyWorkoutSchedule } from "../components/gym/WeeklyWorkoutSchedule";
import { useProductivity } from "../hooks/useProductivity";
import { addDays, formatMinutes, startOfCalendarWeek, toDateKey } from "../utils/date";
import type { Workout, WorkoutCompletionInput, WorkoutInput, WorkoutTemplate, WorkoutTemplateInput } from "../types/productivity";
import "./Tracking.css";

export function Gym() {
    const productivity = useProductivity();
    const [weekAnchor, setWeekAnchor] = useState(() => startOfCalendarWeek(new Date()));
    const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null);
    const [loggingWorkout, setLoggingWorkout] = useState<Workout | null>(null);
    const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
    const [manualEditorOpen, setManualEditorOpen] = useState(false);
    const ensureWorkoutSchedule = productivity.ensureWorkoutSchedule;
    const weekStart = toDateKey(weekAnchor);
    const weekEnd = toDateKey(addDays(weekAnchor, 6));
    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekAnchor, index)), [weekAnchor]);
    const weekly = useMemo(() => productivity.workouts.filter((workout) => workout.date >= weekStart && workout.date <= weekEnd).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)), [productivity.workouts, weekEnd, weekStart]);
    const today = toDateKey(new Date());
    const completed = weekly.filter((workout) => workout.completed);
    const missed = weekly.filter((workout) => !workout.completed && workout.date < today);
    const remaining = weekly.length - completed.length - missed.length;
    const template = productivity.workoutTemplates[0] ?? null;
    const upcoming = useMemo(() => productivity.workouts.filter((workout) => workout.date >= today).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)).slice(0, 12), [productivity.workouts, today]);

    useEffect(() => {
        void ensureWorkoutSchedule(weekStart, weekEnd);
    }, [ensureWorkoutSchedule, weekEnd, weekStart]);

    function openTemplateEditor() { setEditingTemplate(template); setTemplateEditorOpen(true); }
    async function saveTemplate(input: WorkoutTemplateInput) {
        if (editingTemplate) await productivity.updateWorkoutTemplate(editingTemplate.id, input); else await productivity.createWorkoutTemplate(input);
        await ensureWorkoutSchedule(weekStart, weekEnd);
    }
    function saveWorkout(input: WorkoutInput) { return editingWorkout ? productivity.updateWorkout(editingWorkout.id, input).then(() => undefined) : productivity.createWorkout(input).then(() => undefined); }
    function completeWorkout(input: WorkoutCompletionInput) { return loggingWorkout ? productivity.completeWorkout(loggingWorkout.id, input).then(() => undefined) : Promise.resolve(); }
    function reopenWorkout(workout: Workout) { return productivity.reopenWorkout(workout.id); }

    return <main className="gym-page page-shell">
        <header className="tracking-header"><div><p className="eyebrow">Training plan</p><h1>Workouts</h1><p>Plan strength training, sports, cardio, and other physical activity, then log what you complete.</p></div><div className="tracking-actions"><button className="secondary-button" type="button" onClick={openTemplateEditor}>{template ? "Edit weekly schedule" : "Create weekly schedule"}</button><button className="primary-button" type="button" onClick={() => { setEditingWorkout(null); setManualEditorOpen(true); }}>Add workout</button></div></header>
        {productivity.error && <div className="notice notice-error">{productivity.error}</div>}
        <section className="metric-grid"><div className="metric-card"><span>Planned this week</span><strong>{weekly.length}</strong></div><div className="metric-card"><span>Completed</span><strong>{completed.length}</strong></div><div className="metric-card"><span>Remaining</span><strong>{remaining}</strong></div><div className="metric-card"><span>Completion</span><strong>{weekly.length ? `${Math.round((completed.length / weekly.length) * 100)}%` : "0%"}</strong></div><div className="metric-card"><span>Planned hours</span><strong>{formatMinutes(weekly.reduce((sum, workout) => sum + workout.plannedMinutes, 0))}</strong></div><div className="metric-card"><span>Actual time</span><strong>{formatMinutes(completed.reduce((sum, workout) => sum + (workout.actualMinutes || 0), 0))}</strong></div></section>
        <section className="tracking-grid"><WeeklyWorkoutSchedule days={weekDays} workouts={weekly} onPrevious={() => setWeekAnchor((date) => addDays(date, -7))} onToday={() => setWeekAnchor(startOfCalendarWeek(new Date()))} onNext={() => setWeekAnchor((date) => addDays(date, 7))} onComplete={setLoggingWorkout} onReopen={(workout) => void reopenWorkout(workout)} onEdit={(workout) => { setEditingWorkout(workout); setManualEditorOpen(true); }} /><article className="tracking-card"><div className="section-header"><div><p className="eyebrow">Recurring template</p><h2>Weekly schedule</h2></div><button className="small-button" type="button" onClick={openTemplateEditor}>{template ? "Edit" : "Add"}</button></div>{template ? <><div className="template-status"><span className={`status-badge ${template.recurring ? "status-completed" : "status-todo"}`}>{template.recurring ? "Active" : "Paused"}</span></div><div className="tracking-list">{[...template.days].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((day) => <div className="tracking-row" key={day.id}><div className="tracking-main"><strong>{new Intl.DateTimeFormat("en", { weekday: "long" }).format(addDays(startOfCalendarWeek(new Date()), day.dayOfWeek - 1))}</strong><div className="tracking-meta">{day.workoutName} / {day.startTime}-{day.endTime} / {day.exercises.length} exercises</div></div><span className="status-badge status-in-progress">Recurring</span></div>)}</div></> : <p className="empty-state">No recurring schedule yet.</p>}</article></section>
        <section className="tracking-card"><div className="section-header"><div><p className="eyebrow">Next sessions</p><h2>Upcoming workouts</h2></div></div><div className="tracking-list">{upcoming.length ? upcoming.map((workout) => <div className={`tracking-row ${workout.completed ? "completed" : ""}`} key={workout.id}><div className="tracking-main"><div className="tracking-title">{workout.name}</div><div className="tracking-meta">{workout.date} / {workout.startTime}-{workout.endTime} / {workout.workoutType}</div></div><div className="tracking-actions-inline"><span className={`status-badge ${workout.completed ? "status-completed" : "status-todo"}`}>{workout.completed ? "Completed" : "Planned"}</span>{!workout.completed && <button className="small-button" type="button" onClick={() => setLoggingWorkout(workout)}>Log</button>}{workout.completed && <button className="small-button" type="button" onClick={() => void reopenWorkout(workout)}>Reopen</button>}</div></div>) : <p className="empty-state">No workouts planned.</p>}</div></section>
        {templateEditorOpen && <WorkoutTemplateEditor template={editingTemplate} onClose={() => setTemplateEditorOpen(false)} onSave={saveTemplate} onDelete={editingTemplate ? () => productivity.deleteWorkoutTemplate(editingTemplate.id) : undefined} />}
        {loggingWorkout && <WorkoutLogEditor workout={loggingWorkout} onClose={() => setLoggingWorkout(null)} onComplete={completeWorkout} />}
        {manualEditorOpen && <WorkoutEditor workout={editingWorkout} onClose={() => setManualEditorOpen(false)} onSave={saveWorkout} onDelete={editingWorkout ? () => productivity.deleteWorkout(editingWorkout.id) : undefined} />}
    </main>;
}
