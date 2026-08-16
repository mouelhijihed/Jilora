import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../forms/FormActions";
import { ModalForm } from "../forms/ModalForm";
import { toDateKey } from "../../utils/date";
import type { HomeworkStatus, HomeworkTask, HomeworkTaskInput, Priority } from "../../types/productivity";

type HomeworkTaskEditorProps = { task: HomeworkTask | null; onClose: () => void; onSave: (input: HomeworkTaskInput) => Promise<void>; onDelete?: () => Promise<void> };

export function HomeworkTaskEditor({ task, onClose, onSave, onDelete }: HomeworkTaskEditorProps) {
    const [title, setTitle] = useState(task?.title ?? "");
    const [subject, setSubject] = useState(task?.subject ?? "");
    const [description, setDescription] = useState(task?.description ?? "");
    const [dueDate, setDueDate] = useState(task?.dueDate ?? toDateKey(new Date()));
    const [dueTime, setDueTime] = useState(task?.dueTime ?? "23:59");
    const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
    const [estimatedHours, setEstimatedHours] = useState(String((task?.estimatedMinutes ?? 60) / 60));
    const [status, setStatus] = useState<HomeworkStatus>(task?.status ?? "todo");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); try { await onSave({ title: title.trim(), subject: subject.trim(), description: description.trim(), dueDate, dueTime, priority, estimatedMinutes: Math.round(Number(estimatedHours) * 60), status, completedDate: status === "completed" ? (task?.completedDate ?? toDateKey(new Date())) : null }); onClose(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save homework task"); } finally { setSaving(false); } }
    async function remove() { if (!onDelete || !window.confirm("Delete this homework task and its calendar event?")) return; setSaving(true); try { await onDelete(); onClose(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete homework task"); setSaving(false); } }

    return <ModalForm eyebrow="Homework planning" title={task ? "Edit task" : "Add homework task"} onClose={onClose}><form onSubmit={(event) => void submit(event)}>
        <label className="field-label">Title</label><input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Operating systems assignment" required />
        <div className="event-form-grid">
            <label><span className="field-label">Subject</span><input className="text-input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Operating Systems" required /></label>
            <label><span className="field-label">Due date</span><input className="text-input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
            <label><span className="field-label">Due time</span><input className="text-input" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} required /></label>
            <label><span className="field-label">Estimated hours</span><input className="text-input" type="number" min="0.25" max="12" step="0.25" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} /></label>
            <label><span className="field-label">Priority</span><select className="select-input" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <label><span className="field-label">Status</span><select className="select-input" value={status} onChange={(event) => setStatus(event.target.value as HomeworkStatus)}><option value="todo">Todo</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></label>
        </div>
        <label className="field-label">Description</label><textarea className="text-area" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
        {error && <p className="form-error">{error}</p>}
        <FormActions saving={saving} submitLabel="Save task" onCancel={onClose} onDelete={onDelete ? () => void remove() : undefined} />
    </form></ModalForm>;
}
