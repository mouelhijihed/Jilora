import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../forms/FormActions";
import { ModalForm } from "../forms/ModalForm";
import { toDateKey } from "../../utils/date";
import type { InternshipDay, InternshipDayInput } from "../../types/productivity";

type InternshipDayEditorProps = { day: InternshipDay | null; onClose: () => void; onSave: (input: InternshipDayInput) => Promise<void>; onDelete?: () => Promise<void> };

export function InternshipDayEditor({ day, onClose, onSave, onDelete }: InternshipDayEditorProps) {
    const [internshipName, setInternshipName] = useState(day?.internshipName ?? "Internship");
    const [date, setDate] = useState(day?.date ?? toDateKey(new Date()));
    const [startTime, setStartTime] = useState(day?.startTime ?? "09:00");
    const [endTime, setEndTime] = useState(day?.endTime ?? "15:00");
    const [actualHours, setActualHours] = useState(day ? String(day.actualMinutes / 60) : "0");
    const [notes, setNotes] = useState(day?.notes ?? "");
    const [tasks, setTasks] = useState(day?.tasksCompleted.join("\n") ?? "");
    const [completed, setCompleted] = useState(day?.completed ?? false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setSaving(true); setError("");
        try { await onSave({ internshipName: internshipName.trim(), date, startTime, endTime, actualMinutes: Math.round(Number(actualHours) * 60), notes: notes.trim(), tasksCompleted: tasks.split("\n").map((task) => task.trim()).filter(Boolean), completed }); onClose(); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save internship day"); }
        finally { setSaving(false); }
    }

    async function remove() { if (!onDelete || !window.confirm("Delete this internship day and its calendar event?")) return; setSaving(true); try { await onDelete(); onClose(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete internship day"); setSaving(false); } }

    return (
        <ModalForm eyebrow="Internship tracking" title={day ? "Edit internship day" : "Plan internship hours"} onClose={onClose}>
            <form onSubmit={(event) => void submit(event)}>
                <label className="field-label">Internship name</label><input className="text-input" value={internshipName} onChange={(event) => setInternshipName(event.target.value)} required />
                <div className="event-form-grid">
                    <label><span className="field-label">Date</span><input className="text-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
                    <label><span className="field-label">Actual hours</span><input className="text-input" type="number" min="0" max="24" step="0.25" value={actualHours} onChange={(event) => setActualHours(event.target.value)} /></label>
                    <label><span className="field-label">Planned start</span><input className="text-input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
                    <label><span className="field-label">Planned end</span><input className="text-input" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
                </div>
                <label className="field-label">Tasks completed (one per line)</label><textarea className="text-area" rows={3} value={tasks} onChange={(event) => setTasks(event.target.value)} />
                <label className="field-label">Notes</label><textarea className="text-area" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
                <label className="checkbox-field"><input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} /><span>Day completed</span></label>
                {error && <p className="form-error">{error}</p>}
                <FormActions saving={saving} submitLabel="Save hours" onCancel={onClose} onDelete={onDelete ? () => void remove() : undefined} />
            </form>
        </ModalForm>
    );
}
