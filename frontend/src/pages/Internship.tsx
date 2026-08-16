import { useMemo, useState } from "react";
import { InternshipDayEditor } from "../components/internship/InternshipDayEditor";
import { useProductivity } from "../hooks/useProductivity";
import { calculateActualMinutes, calculatePlannedMinutes, endOfMonth, startOfMonth } from "../utils/analytics";
import { formatMinutes, startOfCalendarWeek } from "../utils/date";
import type { InternshipDay, InternshipDayInput } from "../types/productivity";
import "./Tracking.css";

export function Internship() {
    const { internshipDays, error, createInternshipDay, updateInternshipDay, deleteInternshipDay } = useProductivity();
    const [editing, setEditing] = useState<InternshipDay | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const today = new Date();
    const weekStart = startOfCalendarWeek(today);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const planned = calculatePlannedMinutes(internshipDays);
    const actual = calculateActualMinutes(internshipDays);
    const weeklyPlanned = calculatePlannedMinutes(internshipDays, weekStart, weekEnd);
    const monthlyActual = calculateActualMinutes(internshipDays, startOfMonth(today), endOfMonth(today));
    const upcoming = useMemo(() => [...internshipDays].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)), [internshipDays]);
    function save(input: InternshipDayInput) { return editing ? updateInternshipDay(editing.id, input).then(() => undefined) : createInternshipDay(input).then(() => undefined); }
    return <main className="internship-page page-shell"><header className="tracking-header"><div><p className="eyebrow">Work log</p><h1>Internship</h1><p>Plan your working days and compare planned time with actual time.</p></div><button className="primary-button" type="button" onClick={() => { setEditing(null); setEditorOpen(true); }}>Add internship day</button></header>{error && <div className="notice notice-error">{error}</div>}<section className="metric-grid"><div className="metric-card"><span>Total planned</span><strong>{formatMinutes(planned)}</strong></div><div className="metric-card"><span>Total actual</span><strong>{formatMinutes(actual)}</strong></div><div className="metric-card"><span>Remaining</span><strong>{formatMinutes(Math.max(0, planned - actual))}</strong></div><div className="metric-card"><span>Weekly planned</span><strong>{formatMinutes(weeklyPlanned)}</strong></div></section><section className="tracking-grid"><article className="tracking-card"><h2>Internship days</h2><div className="tracking-list">{upcoming.length === 0 && <p className="empty-state">No internship days planned yet.</p>}{upcoming.map((day) => <div className="tracking-row" key={day.id}><div className="tracking-main"><div className="tracking-title">{day.internshipName}</div><div className="tracking-meta">{day.date} / {day.startTime}-{day.endTime}</div></div><div className="tracking-value">{formatMinutes(day.actualMinutes)} / {formatMinutes(day.plannedMinutes)}<div className="tracking-actions-inline"><span className={`status-badge ${day.completed ? "status-completed" : "status-todo"}`}>{day.completed ? "Completed" : "Planned"}</span><button className="small-button" type="button" onClick={() => { setEditing(day); setEditorOpen(true); }}>Edit</button></div></div></div>)}</div></article><article className="tracking-card"><h2>Progress</h2><div className="tracking-row"><span className="tracking-main">Average per planned day</span><strong>{formatMinutes(internshipDays.length ? Math.round(actual / internshipDays.length) : 0)}</strong></div><div className="tracking-row"><span className="tracking-main">Planned vs actual</span><strong>{formatMinutes(actual - planned)}</strong></div><div className="tracking-row"><span className="tracking-main">This month actual</span><strong>{formatMinutes(monthlyActual)}</strong></div></article></section>{editorOpen && <InternshipDayEditor day={editing} onClose={() => setEditorOpen(false)} onSave={save} onDelete={editing ? () => deleteInternshipDay(editing.id) : undefined} />}</main>;
}
