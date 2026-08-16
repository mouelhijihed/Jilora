import { useState } from "react";
import type { FormEvent } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { FormActions } from "../forms/FormActions";
import { ModalForm } from "../forms/ModalForm";
import { calculateDuration } from "../../utils/date";
import type { WorkoutExercise, WorkoutTemplate, WorkoutTemplateDay, WorkoutTemplateInput, WorkoutType } from "../../types/productivity";

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const workoutTypes: WorkoutType[] = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Cardio"];

type DayDraft = WorkoutTemplateDay & { active: boolean };

function emptyDay(dayOfWeek: number): DayDraft {
    return { id: `day-${dayOfWeek}`, dayOfWeek, workoutName: "", workoutType: "Full Body", startTime: "18:00", endTime: "19:00", plannedMinutes: 60, exercises: [], active: false };
}

function exerciseId(dayOfWeek: number, index: number) {
    return `exercise-${dayOfWeek}-${index}-${Date.now()}`;
}

type WorkoutTemplateEditorProps = {
    template: WorkoutTemplate | null;
    onClose: () => void;
    onSave: (input: WorkoutTemplateInput) => Promise<void>;
    onDelete?: () => Promise<void>;
};

export function WorkoutTemplateEditor({ template, onClose, onSave, onDelete }: WorkoutTemplateEditorProps) {
    const [name, setName] = useState(template?.name ?? "Weekly plan");
    const [recurring, setRecurring] = useState(template?.recurring ?? true);
    const [days, setDays] = useState<DayDraft[]>(() => dayNames.map((_, index) => {
        const existing = template?.days.find((day) => day.dayOfWeek === index + 1);
        return existing ? { ...existing, active: true } : emptyDay(index + 1);
    }));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function updateDay(dayOfWeek: number, updates: Partial<DayDraft>) {
        setDays((current) => current.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, ...updates } : day));
    }

    function updateExercise(dayOfWeek: number, exerciseIndex: number, updates: Partial<WorkoutExercise>) {
        setDays((current) => current.map((day) => day.dayOfWeek !== dayOfWeek ? day : { ...day, exercises: day.exercises.map((exercise, index) => index === exerciseIndex ? { ...exercise, ...updates } : exercise) }));
    }

    function addExercise(dayOfWeek: number) {
        setDays((current) => current.map((day) => day.dayOfWeek !== dayOfWeek ? day : { ...day, exercises: [...day.exercises, { id: exerciseId(dayOfWeek, day.exercises.length), name: "", sets: 3, reps: "8-10", notes: "" }] }));
    }

    function removeExercise(dayOfWeek: number, exerciseIndex: number) {
        setDays((current) => current.map((day) => day.dayOfWeek !== dayOfWeek ? day : { ...day, exercises: day.exercises.filter((_, index) => index !== exerciseIndex) }));
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const activeDays = days.filter((day) => day.active);
        if (!activeDays.length) { setError("Select at least one workout day"); return; }
        setSaving(true); setError("");
        try {
            await onSave({
                name: name.trim(),
                recurring,
                days: activeDays.map(({ active: _active, ...day }) => ({ ...day, workoutName: day.workoutName.trim(), plannedMinutes: calculateDuration(day.startTime, day.endTime), exercises: day.exercises.map((exercise) => ({ ...exercise, name: exercise.name.trim(), notes: exercise.notes.trim() })) })),
            });
            onClose();
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not save weekly schedule");
        } finally { setSaving(false); }
    }

    async function remove() {
        if (!onDelete || !window.confirm("Delete this weekly schedule and its future planned workouts?")) return;
        setSaving(true); setError("");
        try { await onDelete(); onClose(); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete weekly schedule"); setSaving(false); }
    }

    return <ModalForm eyebrow="Recurring gym plan" title={template ? "Edit weekly schedule" : "Create weekly schedule"} onClose={onClose}>
        <form onSubmit={(event) => void submit(event)}>
            <label><span className="field-label">Schedule name</span><input className="text-input" value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label className="checkbox-field"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /><span>Automatically schedule this plan every week</span></label>
            <div className="template-days">
                {days.map((day, index) => <section className={`template-day ${day.active ? "active" : ""}`} key={day.dayOfWeek}>
                    <div className="template-day-heading">
                        <label className="checkbox-field"><input type="checkbox" checked={day.active} onChange={(event) => updateDay(day.dayOfWeek, { active: event.target.checked })} /><strong>{dayNames[index]}</strong></label>
                        <span className={`status-badge ${day.active ? "status-in-progress" : "status-todo"}`}>{day.active ? "Workout" : "Rest"}</span>
                    </div>
                    {day.active && <>
                        <div className="event-form-grid">
                            <label><span className="field-label">Workout</span><input className="text-input" value={day.workoutName} onChange={(event) => updateDay(day.dayOfWeek, { workoutName: event.target.value })} placeholder="Push" required /></label>
                            <label><span className="field-label">Type</span><select className="select-input" value={day.workoutType} onChange={(event) => updateDay(day.dayOfWeek, { workoutType: event.target.value as WorkoutType })}>{workoutTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                            <label><span className="field-label">Start</span><input className="text-input" type="time" value={day.startTime} onChange={(event) => updateDay(day.dayOfWeek, { startTime: event.target.value })} required /></label>
                            <label><span className="field-label">End</span><input className="text-input" type="time" value={day.endTime} onChange={(event) => updateDay(day.dayOfWeek, { endTime: event.target.value })} required /></label>
                        </div>
                        <details className="exercise-plan" open={day.exercises.length > 0}>
                            <summary>Exercises ({day.exercises.length})</summary>
                            <div className="exercise-editor-list">
                                {day.exercises.map((exercise, exerciseIndex) => <div className="exercise-editor-row" key={exercise.id}>
                                    <input className="text-input" aria-label="Exercise name" value={exercise.name} onChange={(event) => updateExercise(day.dayOfWeek, exerciseIndex, { name: event.target.value })} placeholder="Bench Press" required />
                                    <input className="text-input compact-input" aria-label="Sets" type="number" min="1" max="30" value={exercise.sets} onChange={(event) => updateExercise(day.dayOfWeek, exerciseIndex, { sets: Number(event.target.value) })} required />
                                    <input className="text-input compact-input" aria-label="Reps" value={exercise.reps} onChange={(event) => updateExercise(day.dayOfWeek, exerciseIndex, { reps: event.target.value })} placeholder="6-8" required />
                                    <button className="icon-button" type="button" title="Remove exercise" aria-label="Remove exercise" onClick={() => removeExercise(day.dayOfWeek, exerciseIndex)}><FiX aria-hidden="true" /></button>
                                </div>)}
                                <button className="small-button" type="button" onClick={() => addExercise(day.dayOfWeek)}><FiPlus aria-hidden="true" />Add exercise</button>
                            </div>
                        </details>
                    </>}
                </section>)}
            </div>
            {error && <p className="form-error">{error}</p>}
            <FormActions saving={saving} submitLabel="Save weekly schedule" onCancel={onClose} onDelete={onDelete ? () => void remove() : undefined} />
        </form>
    </ModalForm>;
}
