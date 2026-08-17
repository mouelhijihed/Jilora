import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../forms/FormActions";
import { ModalForm } from "../forms/ModalForm";
import { toDateKey } from "../../utils/date";
import type { Workout, WorkoutInput, WorkoutType } from "../../types/productivity";

const workoutTypes: WorkoutType[] = ["Strength", "Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Cardio", "Running", "Swimming", "Cycling", "Boxing", "Taekwondo", "Football", "Calisthenics", "Weightlifting", "Other", "Rest"];

type WorkoutEditorProps = {
    workout: Workout | null;
    onClose: () => void;
    onSave: (input: WorkoutInput) => Promise<void>;
    onDelete?: () => Promise<void>;
};

export function WorkoutEditor({ workout, onClose, onSave, onDelete }: WorkoutEditorProps) {
    const [name, setName] = useState(workout?.name ?? "");
    const [workoutType, setWorkoutType] = useState<WorkoutType>(workout?.workoutType ?? "Full Body");
    const [date, setDate] = useState(workout?.date ?? toDateKey(new Date()));
    const [startTime, setStartTime] = useState(workout?.startTime ?? "18:00");
    const [endTime, setEndTime] = useState(workout?.endTime ?? "19:00");
    const [notes, setNotes] = useState(workout?.notes ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true); setError("");
        try { await onSave({ name: name.trim(), workoutType, date, startTime, endTime, notes: notes.trim(), completed: workout?.completed ?? false }); onClose(); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save workout"); }
        finally { setSaving(false); }
    }

    async function remove() {
        if (!onDelete || !window.confirm("Delete this workout and its calendar event?")) return;
        setSaving(true);
        try { await onDelete(); onClose(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete workout"); setSaving(false); }
    }

    return (
        <ModalForm eyebrow="Workout planning" title={workout ? "Edit workout" : "Plan workout"} onClose={onClose}>
            <form onSubmit={(event) => void submit(event)}>
                <label className="field-label">Workout name</label><input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Push day" required />
                <div className="event-form-grid">
                    <label><span className="field-label">Workout type</span><select className="select-input" value={workoutType} onChange={(event) => setWorkoutType(event.target.value as WorkoutType)}>{workoutTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                    <label><span className="field-label">Date</span><input className="text-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
                    <label><span className="field-label">Start</span><input className="text-input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
                    <label><span className="field-label">End</span><input className="text-input" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
                </div>
                <label className="field-label">Notes</label><textarea className="text-area" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
                {error && <p className="form-error">{error}</p>}
                <FormActions saving={saving} submitLabel="Save workout" onCancel={onClose} onDelete={onDelete ? () => void remove() : undefined} />
            </form>
        </ModalForm>
    );
}
