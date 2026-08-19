import { useMemo, useState } from "react";
import { HomeworkTaskEditor } from "../components/homework/HomeworkTaskEditor";
import { useProductivity } from "../hooks/useProductivity";
import { getOverdueTasks } from "../utils/analytics";
import { formatMinutes, toDateKey } from "../utils/date";
import type { HomeworkTask, HomeworkTaskInput } from "../types/productivity";
import "./Tracking.css";

export function Homework() {
    const { homeworkTasks, error, createHomeworkTask, updateHomeworkTask, deleteHomeworkTask } = useProductivity();
    const [editing, setEditing] = useState<HomeworkTask | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [showAllToday, setShowAllToday] = useState(false);
    const [showAllUpcoming, setShowAllUpcoming] = useState(false);
    const [showAllOverdue, setShowAllOverdue] = useState(false);
    const [showAllCompleted, setShowAllCompleted] = useState(false);
    const today = toDateKey(new Date());
    const overdue = getOverdueTasks(homeworkTasks);
    const todayTasks = homeworkTasks.filter((task) => task.dueDate === today);
    const upcoming = useMemo(() => [...homeworkTasks].filter((task) => task.dueDate > today && task.status !== "completed").sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [homeworkTasks, today]);
    const completed = homeworkTasks.filter((task) => task.status === "completed").slice().reverse();
    const visible = <T,>(items: T[], expanded: boolean) => expanded ? items : items.slice(0, 5);
    const openEditor = (task: HomeworkTask | null = null) => { setEditing(task); setEditorOpen(true); };
    function save(input: HomeworkTaskInput) { return editing ? updateHomeworkTask(editing.id, input).then(() => undefined) : createHomeworkTask(input).then(() => undefined); }
    const renderTask = (task: HomeworkTask) => <div className={`tracking-row ${task.dueDate < today && task.status !== "completed" ? "overdue" : ""}`} key={task.id}><div className="tracking-main"><div className="tracking-title">{task.title}</div><div className="tracking-meta">{task.subject} / due {task.dueDate} at {task.dueTime} / {formatMinutes(task.estimatedMinutes)}</div></div><div className="tracking-actions-inline"><span className={`priority-badge priority-${task.priority}`}>{task.priority}</span><span className={`status-badge status-${task.status}`}>{task.status}</span><button className="small-button" type="button" onClick={() => openEditor(task)}>Edit</button></div></div>;
    return <main className="homework-page page-shell"><header className="tracking-header"><div><p className="eyebrow">Assignments</p><h1>Homework</h1><p>Keep due dates, priorities, and completion status in one queue.</p></div><button className="primary-button" type="button" onClick={() => openEditor()}>Add homework</button></header>{error && <div className="notice notice-error">{error}</div>}<section className="metric-grid"><div className="metric-card"><span>Due today</span><strong>{todayTasks.length}</strong></div><div className="metric-card"><span>Upcoming</span><strong>{upcoming.length}</strong></div><div className="metric-card"><span>Overdue</span><strong>{overdue.length}</strong></div><div className="metric-card"><span>Completed</span><strong>{completed.length}</strong></div></section><section className="tracking-grid"><article className="tracking-card"><h2>Today's tasks</h2><div className="tracking-list">{todayTasks.length ? visible(todayTasks, showAllToday).map(renderTask) : <p className="empty-state">Nothing due today.</p>}</div>{todayTasks.length > 5 && <button className="small-button" type="button" onClick={() => setShowAllToday((current) => !current)}>{showAllToday ? "Show less" : "Show more"}</button>}<h2 className="tracking-subsection-title">Upcoming</h2><div className="tracking-list">{upcoming.length ? visible(upcoming, showAllUpcoming).map(renderTask) : <p className="empty-state">No upcoming homework.</p>}</div>{upcoming.length > 5 && <button className="small-button" type="button" onClick={() => setShowAllUpcoming((current) => !current)}>{showAllUpcoming ? "Show less" : "Show more"}</button>}</article><article className="tracking-card"><h2>Needs attention</h2><div className="tracking-list">{overdue.length ? visible(overdue, showAllOverdue).map(renderTask) : <p className="empty-state">No overdue tasks. Keep it that way.</p>}</div>{overdue.length > 5 && <button className="small-button" type="button" onClick={() => setShowAllOverdue((current) => !current)}>{showAllOverdue ? "Show less" : "Show more"}</button>}<h2 className="tracking-subsection-title">Completed</h2><div className="tracking-list">{visible(completed, showAllCompleted).map(renderTask)}</div>{completed.length > 5 && <button className="small-button" type="button" onClick={() => setShowAllCompleted((current) => !current)}>{showAllCompleted ? "Show less" : "Show more"}</button>}</article></section>{editorOpen && <HomeworkTaskEditor task={editing} onClose={() => setEditorOpen(false)} onSave={save} onDelete={editing ? () => deleteHomeworkTask(editing.id) : undefined} />}</main>;
}
