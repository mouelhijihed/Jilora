import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../forms/FormActions";
import { ModalForm } from "../forms/ModalForm";
import { toDateKey } from "../../utils/date";
import type { StudySession, StudySessionInput, StudySubject } from "../../types/productivity";

type StudySessionEditorProps = { session: StudySession | null; subjects: StudySubject[]; onClose: () => void; onSave: (input: StudySessionInput) => Promise<void>; onDelete?: () => Promise<void> };

export function StudySessionEditor({ session, subjects, onClose, onSave, onDelete }: StudySessionEditorProps) {
    const [subjectId, setSubjectId] = useState(session?.subjectId ?? subjects[0]?.id ?? "");
    const [date, setDate] = useState(session?.date ?? toDateKey(new Date()));
    const [startTime, setStartTime] = useState(session?.startTime ?? "14:00");
    const [endTime, setEndTime] = useState(session?.endTime ?? "16:00");
    const [actualHours, setActualHours] = useState(String((session?.actualMinutes ?? 0) / 60));
    const [notes, setNotes] = useState(session?.notes ?? "");
    const [completed, setCompleted] = useState(session?.completed ?? false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!subjectId) return setError("Add a subject first"); setSaving(true); setError(""); try { await onSave({ subjectId, date, startTime, endTime, actualMinutes: Math.round(Number(actualHours) * 60), notes: notes.trim(), completed }); onClose(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save study session"); } finally { setSaving(false); } }
    async function remove() { if (!onDelete || !window.confirm("Delete this study session and its calendar event?")) return; setSaving(true); try { await onDelete(); onClose(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete study session"); setSaving(false); } }

    return <ModalForm eyebrow="Study planning" title={session ? "Edit study session" : "Plan study session"} onClose={onClose}><form onSubmit={(event) => void submit(event)}>
        <label className="field-label">Subject</label><select className="select-input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{subjects.length === 0 && <option value="">No subjects yet</option>}{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select>
        <div className="event-form-grid">
            <label><span className="field-label">Date</span><input className="text-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
            <label><span className="field-label">Actual hours</span><input className="text-input" type="number" min="0" max="24" step="0.25" value={actualHours} onChange={(event) => setActualHours(event.target.value)} /></label>
            <label><span className="field-label">Start</span><input className="text-input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
            <label><span className="field-label">End</span><input className="text-input" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
        </div>
        <label className="field-label">Notes</label><textarea className="text-area" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        <label className="checkbox-field"><input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} /><span>Session completed</span></label>
        {error && <p className="form-error">{error}</p>}
        <FormActions saving={saving} submitLabel="Save session" onCancel={onClose} onDelete={onDelete ? () => void remove() : undefined} />
    </form></ModalForm>;
}
