import { useState } from "react";
import type { FormEvent } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { FormActions } from "../forms/FormActions";
import { ModalForm } from "../forms/ModalForm";
import type { Workout, WorkoutCompletionInput, WorkoutLogExercise } from "../../types/productivity";

function localDateTimeValue(workout: Workout) {
    return `${workout.date}T${workout.startTime}`;
}

function initialExercises(workout: Workout): WorkoutLogExercise[] {
    return (workout.exercises || []).map((exercise) => ({ name: exercise.name, sets: Array.from({ length: exercise.sets }, () => ({ reps: 0, weight: 0 })) }));
}

type WorkoutLogEditorProps = {
    workout: Workout;
    onClose: () => void;
    onComplete: (input: WorkoutCompletionInput) => Promise<void>;
};

export function WorkoutLogEditor({ workout, onClose, onComplete }: WorkoutLogEditorProps) {
    const [durationMinutes, setDurationMinutes] = useState(workout.plannedMinutes);
    const [exercises, setExercises] = useState<WorkoutLogExercise[]>(() => initialExercises(workout));
    const [notes, setNotes] = useState("");
    const [startedAt, setStartedAt] = useState(() => localDateTimeValue(workout));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function updateExercise(index: number, updates: Partial<WorkoutLogExercise>) {
        setExercises((current) => current.map((exercise, exerciseIndex) => exerciseIndex === index ? { ...exercise, ...updates } : exercise));
    }

    function updateSet(exerciseIndex: number, setIndex: number, field: "reps" | "weight", value: number) {
        setExercises((current) => current.map((exercise, index) => index !== exerciseIndex ? exercise : { ...exercise, sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, [field]: value } : set) }));
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setSaving(true); setError("");
        try {
            const startedAtDate = new Date(startedAt);
            if (Number.isNaN(startedAtDate.getTime())) throw new Error("Choose a valid workout start time");
            await onComplete({ durationMinutes, startedAt: startedAtDate.toISOString(), notes: notes.trim(), exercises: exercises.filter((exercise) => exercise.name.trim()).map((exercise) => ({ ...exercise, name: exercise.name.trim(), sets: exercise.sets.filter((set) => set.reps > 0) })) });
            onClose();
        } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not complete workout"); }
        finally { setSaving(false); }
    }

    return <ModalForm eyebrow="Workout log" title={`Complete ${workout.name}`} onClose={onClose}>
        <form onSubmit={(event) => void submit(event)}>
            <label><span className="field-label">Actual duration (minutes)</span><input className="text-input" type="number" min="1" max="1440" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} required /></label>
            <label><span className="field-label">Workout started</span><input className="text-input" type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} required /></label>
            <div className="workout-log-exercises">
                {exercises.map((exercise, exerciseIndex) => <section className="workout-log-exercise" key={`${exercise.name}-${exerciseIndex}`}>
                    <div className="template-day-heading"><input className="text-input" aria-label="Exercise" value={exercise.name} onChange={(event) => updateExercise(exerciseIndex, { name: event.target.value })} required /><button className="icon-button" type="button" title="Remove exercise" aria-label="Remove exercise" onClick={() => setExercises((current) => current.filter((_, index) => index !== exerciseIndex))}><FiX aria-hidden="true" /></button></div>
                    <div className="set-log-list">
                        {exercise.sets.map((set, setIndex) => <div className="set-log-row" key={setIndex}><span>Set {setIndex + 1}</span><label><span>Reps</span><input className="text-input compact-input" type="number" min="0" value={set.reps} onChange={(event) => updateSet(exerciseIndex, setIndex, "reps", Number(event.target.value))} /></label><label><span>kg</span><input className="text-input compact-input" type="number" min="0" step="0.5" value={set.weight} onChange={(event) => updateSet(exerciseIndex, setIndex, "weight", Number(event.target.value))} /></label><button className="icon-button" type="button" title="Remove set" aria-label="Remove set" onClick={() => updateExercise(exerciseIndex, { sets: exercise.sets.filter((_, index) => index !== setIndex) })}><FiX aria-hidden="true" /></button></div>)}
                        <button className="small-button" type="button" onClick={() => updateExercise(exerciseIndex, { sets: [...exercise.sets, { reps: 0, weight: 0 }] })}><FiPlus aria-hidden="true" />Add set</button>
                    </div>
                </section>)}
                <button className="small-button" type="button" onClick={() => setExercises((current) => [...current, { name: "", sets: [{ reps: 0, weight: 0 }] }])}><FiPlus aria-hidden="true" />Add exercise</button>
            </div>
            <label><span className="field-label">Notes</span><textarea className="text-area" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            {error && <p className="form-error">{error}</p>}
            <FormActions saving={saving} submitLabel="Complete workout" onCancel={onClose} />
        </form>
    </ModalForm>;
}
