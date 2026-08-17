import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FiX } from "react-icons/fi";
import { calculateDuration, formatMinutes, toDateKey } from "../../utils/date";
import { eventTypes } from "../../types/planner";
import type { CalendarEvent, CalendarEventInput, CalendarEventType } from "../../types/planner";
import "../forms/ModalForm.css";

type EventEditorProps = {
    event: CalendarEvent | null;
    initialDate: string;
    onClose: () => void;
    onSave: (input: CalendarEventInput) => Promise<void>;
    onDelete: (() => Promise<void>) | null;
};

export function EventEditor({ event, initialDate, onClose, onSave, onDelete }: EventEditorProps) {
    const [title, setTitle] = useState("");
    const [type, setType] = useState<CalendarEventType>("general");
    const [date, setDate] = useState(initialDate || toDateKey(new Date()));
    const [startTime, setStartTime] = useState("09:00");
    const [endTime, setEndTime] = useState("10:00");
    const [notes, setNotes] = useState("");
    const [completed, setCompleted] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setTitle(event?.title ?? "");
        setType(event?.type ?? "general");
        setDate(event?.date ?? initialDate ?? toDateKey(new Date()));
        setStartTime(event?.startTime ?? "09:00");
        setEndTime(event?.endTime ?? "10:00");
        setNotes(event?.notes ?? "");
        setCompleted(event?.completed ?? false);
        setError("");
    }, [event, initialDate]);

    const duration = calculateDuration(startTime, endTime);
    const linkedEntity = event?.metadata.entityType;

    async function submit(formEvent: FormEvent<HTMLFormElement>) {
        formEvent.preventDefault();
        if (!title.trim()) return setError("Enter an event title");
        if (duration <= 0) return setError("End time must be later than start time");
        if (!event) {
            const startsAt = new Date(`${date}T${startTime}:00`);
            if (Number.isNaN(startsAt.getTime())) return setError("Enter a valid event date and time");
            if (startsAt < new Date()) return setError("Event start time must be in the future");
        }
        setSaving(true);
        setError("");
        try {
            await onSave({ title: title.trim(), type, date, startTime, endTime, completed, notes: notes.trim(), metadata: event?.metadata ?? {} });
            onClose();
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not save event");
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!onDelete || !window.confirm("Delete this event?")) return;
        setSaving(true);
        try {
            await onDelete();
            onClose();
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not delete event");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) onClose(); }}>
            <section className="event-editor" role="dialog" aria-modal="true" aria-labelledby="event-editor-title">
                <div className="modal-header">
                    <div><p className="eyebrow">Planner event</p><h2 id="event-editor-title">{event ? "Edit event" : "Add event"}</h2></div>
                    <button className="icon-button" type="button" onClick={onClose} aria-label="Close" title="Close"><FiX aria-hidden="true" /></button>
                </div>
                <form onSubmit={(formEvent) => void submit(formEvent)}>
                    <label className="field-label" htmlFor="event-title">Title</label>
                    <input id="event-title" className="text-input" value={title} onChange={(inputEvent) => setTitle(inputEvent.target.value)} maxLength={120} autoFocus required disabled={linkedEntity === "studySession"} />

                    <div className="event-form-grid">
                        <label><span className="field-label">Category</span><select className="select-input" value={type} onChange={(inputEvent) => setType(inputEvent.target.value as CalendarEventType)} disabled={Boolean(linkedEntity)}>{eventTypes.map((eventType) => <option value={eventType} key={eventType}>{eventType === "job" ? "Part-Time Job" : eventType[0].toUpperCase() + eventType.slice(1)}</option>)}</select></label>
                        <label><span className="field-label">Date</span><input className="text-input" type="date" value={date} min={event ? undefined : toDateKey(new Date())} onChange={(inputEvent) => setDate(inputEvent.target.value)} required /></label>
                        <label><span className="field-label">Start time</span><input className="text-input" type="time" value={startTime} onChange={(inputEvent) => setStartTime(inputEvent.target.value)} required /></label>
                        <label><span className="field-label">End time</span><input className="text-input" type="time" value={endTime} onChange={(inputEvent) => setEndTime(inputEvent.target.value)} required /></label>
                    </div>

                    <div className="duration-preview"><span>Planned duration</span><strong>{formatMinutes(duration)}</strong></div>
                    {linkedEntity && <p className="linked-event-note">This event is synchronized with its {String(linkedEntity).replace(/([A-Z])/g, " $1").toLowerCase()} record.</p>}
                    <label className="field-label" htmlFor="event-notes">Notes</label>
                    <textarea id="event-notes" className="text-area" value={notes} onChange={(inputEvent) => setNotes(inputEvent.target.value)} rows={4} maxLength={2000} />
                    <label className="checkbox-field"><input type="checkbox" checked={completed} onChange={(inputEvent) => setCompleted(inputEvent.target.checked)} /><span>Mark as completed</span></label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <div className="modal-actions">
                        {onDelete && <button className="danger-button" type="button" onClick={() => void remove()} disabled={saving}>Delete</button>}
                        <span />
                        <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
                        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save event"}</button>
                    </div>
                </form>
            </section>
        </div>
    );
}
