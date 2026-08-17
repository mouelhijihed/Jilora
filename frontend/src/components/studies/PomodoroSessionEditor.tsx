import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../forms/FormActions";
import { ModalForm } from "../forms/ModalForm";
import { toDateKey } from "../../utils/date";
import type { ActivitySession, ActivitySessionInput } from "../../types/sessions";
import type { StudySubject } from "../../types/productivity";

type Props = {
    session: ActivitySession | null;
    subjects: StudySubject[];
    onClose: () => void;
    onSave: (input: ActivitySessionInput) => Promise<void>;
    onDelete?: () => Promise<void>;
};

function localTime(value: Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

export function PomodoroSessionEditor({ session, subjects, onClose, onSave, onDelete }: Props) {
    const initial = session ? new Date(session.startedAt) : new Date();
    const [subjectId, setSubjectId] = useState(session?.subjectId || subjects[0]?.id || "");
    const [date, setDate] = useState(toDateKey(initial));
    const [startTime, setStartTime] = useState(localTime(initial));
    const [durationMinutes, setDurationMinutes] = useState(String(session ? Math.max(1, Math.round(session.actualDuration / 60)) : 25));
    const [notes, setNotes] = useState(session?.topic || "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const durationSeconds = Math.round(Number(durationMinutes) * 60);
        const startedAt = new Date(`${date}T${startTime}:00`);
        const completedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
        if (!subjectId) return setError("Select a study subject");
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return setError("Duration must be greater than zero");
        if (Number.isNaN(startedAt.getTime())) return setError("Enter a valid date and time");
        if (startedAt > new Date() || completedAt > new Date()) return setError("Completed sessions cannot be in the future");
        setSaving(true);
        setError("");
        try {
            await onSave({
                activity: "study",
                subjectId,
                topic: notes.trim(),
                plannedDuration: durationSeconds,
                actualDuration: durationSeconds,
                status: "completed",
                sessionType: "focus",
                pomodoroNumber: session?.pomodoroNumber || 0,
                startedAt: startedAt.toISOString(),
                activeStartedAt: null,
                completedAt: completedAt.toISOString(),
            });
            onClose();
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not save Pomodoro");
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!onDelete || !window.confirm("Delete this personal Pomodoro record?")) return;
        setSaving(true);
        setError("");
        try { await onDelete(); onClose(); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete Pomodoro"); setSaving(false); }
    }

    return <ModalForm eyebrow="Study history" title={session ? "Edit Pomodoro" : "Log completed Pomodoro"} onClose={onClose}><form onSubmit={(event) => void submit(event)}>
        <label><span className="field-label">Subject</span><select className="select-input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Select subject</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>
        <div className="event-form-grid">
            <label><span className="field-label">Date</span><input className="text-input" type="date" value={date} max={toDateKey(new Date())} onChange={(event) => setDate(event.target.value)} required /></label>
            <label><span className="field-label">Start time</span><input className="text-input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
            <label><span className="field-label">Duration (minutes)</span><input className="text-input" type="number" min="1" max="1440" step="1" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required /></label>
        </div>
        <label><span className="field-label">Topic or notes</span><textarea className="text-input" rows={4} maxLength={240} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What did you study?" /></label>
        {session?.partnerSessionId && <p className="form-error">Shared study records are managed from Partner.</p>}
        {error && <p className="form-error">{error}</p>}
        <FormActions saving={saving} submitLabel={session ? "Save Pomodoro" : "Log Pomodoro"} onCancel={onClose} onDelete={onDelete ? () => void remove() : undefined} />
    </form></ModalForm>;
}
