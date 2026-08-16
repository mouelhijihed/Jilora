import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../forms/FormActions";
import { ModalForm } from "../forms/ModalForm";
import type { Priority, StudySubject, StudySubjectInput } from "../../types/productivity";

type SubjectEditorProps = { subject: StudySubject | null; onClose: () => void; onSave: (input: StudySubjectInput) => Promise<void>; onDelete?: () => Promise<void> };

export function SubjectEditor({ subject, onClose, onSave, onDelete }: SubjectEditorProps) {
    const [name, setName] = useState(subject?.name ?? "");
    const [weekly, setWeekly] = useState(String(subject?.targetWeeklyHours ?? 4));
    const [monthly, setMonthly] = useState(String(subject?.targetMonthlyHours ?? 16));
    const [priority, setPriority] = useState<Priority>(subject?.priority ?? "medium");
    const [color, setColor] = useState(subject?.color ?? "#72c59b");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); try { await onSave({ name: name.trim(), targetWeeklyHours: Number(weekly), targetMonthlyHours: Number(monthly), priority, color }); onClose(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save subject"); } finally { setSaving(false); } }
    async function remove() { if (!onDelete || !window.confirm("Delete this subject? Study sessions must be removed first.")) return; setSaving(true); try { await onDelete(); onClose(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete subject"); setSaving(false); } }

    return <ModalForm eyebrow="Study setup" title={subject ? "Edit subject" : "Add subject"} onClose={onClose}><form onSubmit={(event) => void submit(event)}>
        <label className="field-label">Subject name</label><input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Algorithms" required />
        <div className="event-form-grid">
            <label><span className="field-label">Weekly target (hours)</span><input className="text-input" type="number" min="0" max="168" step="0.5" value={weekly} onChange={(event) => setWeekly(event.target.value)} /></label>
            <label><span className="field-label">Monthly target (hours)</span><input className="text-input" type="number" min="0" max="744" step="0.5" value={monthly} onChange={(event) => setMonthly(event.target.value)} /></label>
            <label><span className="field-label">Priority</span><select className="select-input" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <label><span className="field-label">Color</span><input className="text-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <FormActions saving={saving} submitLabel="Save subject" onCancel={onClose} onDelete={onDelete ? () => void remove() : undefined} />
    </form></ModalForm>;
}
