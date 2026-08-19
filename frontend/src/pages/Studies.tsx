import { useMemo, useState } from "react";
import { StudyPomodoro } from "../components/studies/StudyPomodoro";
import { PomodoroSessionEditor } from "../components/studies/PomodoroSessionEditor";
import { SubjectEditor } from "../components/studies/SubjectEditor";
import { StudySessionEditor } from "../components/studies/StudySessionEditor";
import { useProductivity } from "../hooks/useProductivity";
import { useSessions } from "../hooks/useSessions";
import { calculateCompletionRate, getStudyMinutesBySubject } from "../utils/analytics";
import { formatMinutes, startOfCalendarWeek, toDateKey } from "../utils/date";
import type { StudySession, StudySessionInput, StudySubject, StudySubjectInput } from "../types/productivity";
import type { ActivitySession, ActivitySessionInput } from "../types/sessions";
import "./Tracking.css";

export function Studies() {
    const { subjects, studySessions, loading, error, createSubject, updateSubject, deleteSubject, createStudySession, updateStudySession, deleteStudySession } = useProductivity();
    const { sessions, createSession: createActivitySession, updateSession: updateActivitySession, deleteSession: deleteActivitySession } = useSessions();
    const [subjectEditorOpen, setSubjectEditorOpen] = useState(false);
    const [sessionEditorOpen, setSessionEditorOpen] = useState(false);
    const [editingSubject, setEditingSubject] = useState<StudySubject | null>(null);
    const [editingSession, setEditingSession] = useState<StudySession | null>(null);
    const [pomodoroEditorOpen, setPomodoroEditorOpen] = useState(false);
    const [editingPomodoro, setEditingPomodoro] = useState<ActivitySession | null>(null);
    const weekStart = toDateKey(startOfCalendarWeek(new Date()));
    const weekEnd = toDateKey(new Date(startOfCalendarWeek(new Date()).setDate(startOfCalendarWeek(new Date()).getDate() + 6)));
    const weeklySessions = studySessions.filter((session) => session.date >= weekStart && session.date <= weekEnd);
    const completedWeeklySessions = weeklySessions.filter((session) => session.completed);
    const weeklyPomodoros = sessions.filter((session) => session.activity === "study" && session.sessionType === "focus" && session.status === "completed" && toDateKey(new Date(session.completedAt || session.startedAt)) >= weekStart && toDateKey(new Date(session.completedAt || session.startedAt)) <= weekEnd);
    const today = toDateKey(new Date());
    const todayPomodoros = weeklyPomodoros.filter((session) => toDateKey(new Date(session.completedAt || session.startedAt)) === today);
    const subjectMinutes = getStudyMinutesBySubject(completedWeeklySessions);
    const pomodoroMinutes = weeklyPomodoros.reduce((sum, session) => sum + Math.round(session.actualDuration / 60), 0);
    const plannedWeekly = weeklySessions.reduce((sum, session) => sum + session.plannedMinutes, 0);
    const actualWeekly = completedWeeklySessions.reduce((sum, session) => sum + session.actualMinutes, 0) + pomodoroMinutes;
    const recentSessions = useMemo(() => [...studySessions].sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`)), [studySessions]);
    const recentPomodoros = useMemo(() => [...sessions].filter((session) => session.activity === "study" && session.sessionType === "focus").sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [sessions]);
    const openSubject = (subject: StudySubject | null = null) => { setEditingSubject(subject); setSubjectEditorOpen(true); };
    const openSession = (session: StudySession | null = null) => { setEditingSession(session); setSessionEditorOpen(true); };
    const openPomodoro = (session: ActivitySession | null = null) => { setEditingPomodoro(session); setPomodoroEditorOpen(true); };
    function saveSubject(input: StudySubjectInput) { return editingSubject ? updateSubject(editingSubject.id, input).then(() => undefined) : createSubject(input).then(() => undefined); }
    function saveSession(input: StudySessionInput) { return editingSession ? updateStudySession(editingSession.id, input).then(() => undefined) : createStudySession(input).then(() => undefined); }
    function savePomodoro(input: ActivitySessionInput) { return editingPomodoro ? updateActivitySession(editingPomodoro.id, input).then(() => undefined) : createActivitySession(input).then(() => undefined); }

    return <main className="studies-page page-shell">
        <header className="tracking-header"><div><p className="eyebrow">Learning plan</p><h1>Studies</h1><p>Set targets, focus with Pomodoro, and keep actual study time attached to a subject.</p></div><div className="tracking-actions"><button className="secondary-button" type="button" onClick={() => openSubject()}>Add subject</button><button className="secondary-button" type="button" onClick={() => openPomodoro()} disabled={!subjects.length}>Log Pomodoro</button><button className="primary-button" type="button" onClick={() => openSession()} disabled={!subjects.length}>Add study session</button></div></header>
        {error && <div className="notice notice-error">{error}</div>}
        <section className="metric-grid"><div className="metric-card"><span>Study today</span><strong>{formatMinutes(studySessions.filter((session) => session.date === today && session.completed).reduce((sum, session) => sum + session.actualMinutes, 0) + todayPomodoros.reduce((sum, session) => sum + Math.round(session.actualDuration / 60), 0))}</strong></div><div className="metric-card"><span>Pomodoros today</span><strong>{todayPomodoros.length}</strong></div><div className="metric-card"><span>Actual this week</span><strong>{formatMinutes(actualWeekly)}</strong></div><div className="metric-card"><span>Planned this week</span><strong>{formatMinutes(plannedWeekly)}</strong></div><div className="metric-card"><span>Session completion</span><strong>{calculateCompletionRate(weeklySessions)}%</strong></div></section>
        <StudyPomodoro />
        <section className="tracking-grid"><article className="tracking-card"><h2>Subject targets</h2><div className="tracking-list">{loading && <p className="empty-state">Loading subjects...</p>}{!loading && !subjects.length && <p className="empty-state">Add your first subject to start tracking.</p>}{subjects.map((subject) => { const minutes = (subjectMinutes[subject.id] || 0) + weeklyPomodoros.filter((session) => session.subjectId === subject.id).reduce((sum, session) => sum + Math.round(session.actualDuration / 60), 0); const target = subject.targetWeeklyHours * 60; const progress = target ? Math.min(100, Math.round((minutes / target) * 100)) : 0; return <div className="tracking-row" key={subject.id}><div className="tracking-main"><div className="tracking-title" style={{ color: subject.color }}>{subject.name}</div><div className="tracking-meta">{formatMinutes(minutes)} of {subject.targetWeeklyHours}h weekly / {subject.priority} priority</div><div className="progress-track"><span style={{ width: `${progress}%`, background: subject.color }} /></div></div><div className="tracking-actions-inline"><strong>{progress}%</strong><button className="small-button" type="button" onClick={() => openSubject(subject)}>Edit</button></div></div>; })}</div></article><article className="tracking-card"><h2>Recent Pomodoros</h2><div className="tracking-list">{!recentPomodoros.length && <p className="empty-state">Completed study Pomodoros appear here.</p>}{recentPomodoros.slice(0, 8).map((session) => <div className="tracking-row" key={session.id}><div className="tracking-main"><div className="tracking-title">{session.subject || "Study"}</div><div className="tracking-meta">{session.topic || "Focus"} / {formatMinutes(Math.round(session.actualDuration / 60))} / {new Date(session.startedAt).toLocaleString()}</div></div><div className="tracking-actions-inline"><span className={`status-badge ${session.status === "completed" ? "status-completed" : session.status === "cancelled" ? "status-missed" : "status-todo"}`}>{session.status}</span>{session.status === "completed" && !session.partnerSessionId && <button className="small-button" type="button" onClick={() => openPomodoro(session)}>Edit</button>}</div></div>)}</div></article></section>
        <section className="tracking-card"><h2>Recent planned sessions</h2><div className="tracking-list">{!recentSessions.length && <p className="empty-state">Planned study sessions appear here.</p>}{recentSessions.slice(0, 8).map((session) => { const subject = subjects.find((item) => item.id === session.subjectId); return <div className="tracking-row" key={session.id}><div className="tracking-main"><div className="tracking-title">{subject?.name ?? "Unknown subject"}</div><div className="tracking-meta">{session.date} / {session.startTime}-{session.endTime} / {formatMinutes(session.actualMinutes)} actual</div></div><div className="tracking-actions-inline"><span className={`status-badge ${session.completed ? "status-completed" : "status-todo"}`}>{session.completed ? "Done" : "Planned"}</span><button className="small-button" type="button" onClick={() => openSession(session)}>Edit</button></div></div>; })}</div></section>
        {subjectEditorOpen && <SubjectEditor subject={editingSubject} onClose={() => setSubjectEditorOpen(false)} onSave={saveSubject} onDelete={editingSubject ? () => deleteSubject(editingSubject.id) : undefined} />}
        {sessionEditorOpen && <StudySessionEditor session={editingSession} subjects={subjects} onClose={() => setSessionEditorOpen(false)} onSave={saveSession} onDelete={editingSession ? () => deleteStudySession(editingSession.id) : undefined} />}
        {pomodoroEditorOpen && <PomodoroSessionEditor session={editingPomodoro} subjects={subjects} onClose={() => setPomodoroEditorOpen(false)} onSave={savePomodoro} onDelete={editingPomodoro ? () => deleteActivitySession(editingPomodoro.id) : undefined} />}
    </main>;
}
