import { useCallback, useEffect, useState } from "react";
import { FiActivity, FiAlertCircle, FiArrowRight, FiBookOpen, FiCalendar, FiCheckCircle, FiCircle, FiClock, FiUsers } from "react-icons/fi";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { subscribeRealtime } from "../hooks/useRealtime";
import { apiRequest } from "../services/api";
import { formatMinutes } from "../utils/date";
import type { Presence, UserPreferences } from "../types/auth";
import type { CalendarEvent } from "../types/planner";
import "./Dashboard.css";

type DashboardData = {
    preferences: UserPreferences;
    presence: Presence;
    today: { studyMinutes?: number; homeworkCompleted?: number; homeworkTotal?: number; gymCompleted?: number; gymPlanned?: number; jobMinutes?: number };
    weekly: { studyMinutes?: number; homeworkCompleted?: number; homeworkTotal?: number; gymCompleted?: number; gymPlanned?: number; gymMinutes?: number; jobMinutes?: number };
    tasks: Array<{ id: string; title: string; category: string; completed: boolean }>;
    priorities: Array<{ id: string; title: string; subjectName: string; dueDate: string | null; priority: string; status: string }>;
    schedule: CalendarEvent[];
    upcoming: CalendarEvent[];
    partner: { partner: { id: string; firstName: string; lastName: string; username: string }; presence: Presence; status: string; study: { weekMinutes: number } | null; homework: { completed: number; total: number } | null; workout: { weekCompleted: number } | null; activity: Array<{ id: string; message: string; createdAt: string }> } | null;
};

function readableDate(date: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return "Date unavailable";
    const value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(value.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(value);
}

function dashboardData(value: unknown): DashboardData {
    if (!value || typeof value !== "object") throw new Error("The dashboard response was empty");
    const candidate = value as Partial<DashboardData>;
    if (!candidate.preferences || !candidate.presence || !candidate.today || !candidate.weekly
        || !Array.isArray(candidate.tasks) || !Array.isArray(candidate.priorities)
        || !Array.isArray(candidate.schedule) || !Array.isArray(candidate.upcoming)) {
        throw new Error("The dashboard response was incomplete");
    }
    if (candidate.partner && (!candidate.partner.partner || !candidate.partner.presence || !Array.isArray(candidate.partner.activity))) {
        throw new Error("The partner dashboard response was incomplete");
    }
    return candidate as DashboardData;
}

function eventLabel(type: string) { return type === "gym" ? "workout" : type === "job" ? "part-time job" : type; }
function priorityLabel(priority: string) { return priority === "critical" ? "Urgent" : priority; }

export function Dashboard() {
    const { user } = useAuth();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            const next = dashboardData(await apiRequest<unknown>("/api/dashboard"));
            setData(next);
            setError("");
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not load dashboard");
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        void load(true);
        const interval = window.setInterval(() => { if (mounted) void load(false); }, 60000);
        return () => { mounted = false; window.clearInterval(interval); };
    }, [load]);
    useEffect(() => subscribeRealtime(() => { void load(false); }), [load]);

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const nextActivity = data?.upcoming[0];

    return <main className="dashboard page-shell">
        <header className="dashboard-header">
            <div><p className="eyebrow">Overview</p><h1>{greeting}, {user?.firstName}</h1><p>Today at a glance, with the next action close at hand.</p></div>
            <div className="dashboard-header-meta"><span className={`presence-label ${data?.presence.online ? "online" : "offline"}`}><i aria-hidden="true" />{data?.presence.status || "Checking status"}</span><time className="dashboard-date">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</time></div>
        </header>
        {error && data && <div className="notice notice-error" role="alert"><FiAlertCircle aria-hidden="true" /><span>{error}</span><button className="small-button" type="button" onClick={() => void load(false)}>Retry</button></div>}
        {loading && !data ? <div className="calendar-loading">Loading your dashboard...</div> : error && !data ? <section className="dashboard-load-error" role="alert"><FiAlertCircle aria-hidden="true" /><div><h2>Unable to load your dashboard.</h2><p>{error}</p></div><button className="primary-button" type="button" onClick={() => void load(true)}>Retry</button></section> : data && <>
            <section className="dashboard-quick-actions" aria-label="Quick actions"><Link className="secondary-button" to="/planner"><FiCalendar aria-hidden="true" />Open planner</Link>{data.preferences.student && <Link className="primary-button" to="/studies"><FiBookOpen aria-hidden="true" />Start studying</Link>}<Link className="secondary-button" to="/partner"><FiUsers aria-hidden="true" />Partner</Link></section>

            <section className="dashboard-section" aria-labelledby="today-heading"><div className="section-header"><div><p className="eyebrow">Today</p><h2 id="today-heading">What is happening now</h2></div>{nextActivity && <span className="dashboard-next"><FiClock aria-hidden="true" />Next: {nextActivity.title} at {nextActivity.startTime}</span>}</div><div className="dashboard-grid dashboard-primary-grid"><article className="dashboard-card"><div className="section-header"><h3>Schedule</h3><Link className="text-link" to="/planner">View calendar <FiArrowRight aria-hidden="true" /></Link></div><div className="overview-list">{data.schedule.length ? data.schedule.map((event) => <div className={`schedule-row event-accent-${event.type} ${event.completed ? "completed" : ""}`} key={event.id}><time>{event.startTime}</time><div><strong>{event.title}</strong><span>{event.endTime} / {eventLabel(event.type)}</span></div></div>) : <p className="empty-state">Your schedule is open today.</p>}</div></article><article className="dashboard-card"><div className="section-header"><h3>Progress today</h3></div><div className="dashboard-progress-list">{data.preferences.student && <div><span>Study</span><strong>{formatMinutes(data.today.studyMinutes || 0)}</strong></div>}{data.preferences.student && <div><span>Homework</span><strong>{data.today.homeworkCompleted || 0} / {data.today.homeworkTotal || 0}</strong></div>}{data.preferences.gym && <div><span>Workouts</span><strong>{data.today.gymCompleted || 0} / {data.today.gymPlanned || 0}</strong></div>}{data.preferences.partTimeJob && <div><span>Part-Time Job</span><strong>{formatMinutes(data.today.jobMinutes || 0)}</strong></div>}</div></article></div></section>

            <section className="dashboard-section" aria-labelledby="priority-heading"><div className="section-header"><div><p className="eyebrow">Priorities</p><h2 id="priority-heading">Focus before the day gets away</h2></div><Link className="text-link" to="/homework">Open homework <FiArrowRight aria-hidden="true" /></Link></div><div className="dashboard-grid dashboard-primary-grid"><article className="dashboard-card"><div className="overview-list">{data.priorities.length ? data.priorities.map((item) => <div className="overview-row priority-row" key={item.id}><span className={`priority-dot priority-${item.priority}`} aria-hidden="true" /><div><strong>{item.title}</strong><span>{item.subjectName || "General"} / {item.dueDate ? readableDate(item.dueDate) : "No due date"}</span></div><em>{priorityLabel(item.priority)}</em></div>) : <p className="empty-state">No urgent homework is waiting.</p>}</div></article><article className="dashboard-card"><div className="overview-list">{data.tasks.length ? data.tasks.slice(0, 6).map((task) => <div className="overview-row" key={task.id}><span className="task-state" aria-hidden="true">{task.completed ? <FiCheckCircle /> : <FiCircle />}</span><div><strong>{task.title}</strong><span>{task.category}</span></div></div>) : <p className="empty-state">No open tasks for today.</p>}</div></article></div></section>

            <section className="dashboard-section" aria-labelledby="summary-heading"><div className="section-header"><div><p className="eyebrow">Productivity summary</p><h2 id="summary-heading">This week</h2></div><Link className="text-link" to="/analytics">View analytics <FiArrowRight aria-hidden="true" /></Link></div><div className="weekly-summary dashboard-summary-grid">{data.preferences.student && <><div><span>Study</span><strong>{formatMinutes(data.weekly.studyMinutes || 0)}</strong></div><div><span>Homework</span><strong>{data.weekly.homeworkCompleted || 0} / {data.weekly.homeworkTotal || 0}</strong></div></>}{data.preferences.gym && <div><span>Workouts</span><strong>{data.weekly.gymCompleted || 0} / {data.weekly.gymPlanned || 0}</strong><small>{formatMinutes(data.weekly.gymMinutes || 0)} actual</small></div>}{data.preferences.partTimeJob && <div><span>Part-Time Job</span><strong>{formatMinutes(data.weekly.jobMinutes || 0)}</strong></div>}</div></section>

            <section className="dashboard-section" aria-labelledby="partner-heading"><div className="section-header"><div><p className="eyebrow">Partner</p><h2 id="partner-heading">Accountability at a glance</h2></div><Link className="text-link" to="/partner">View Partner <FiArrowRight aria-hidden="true" /></Link></div><article className="dashboard-card partner-summary-card">{data.partner ? <><div className="partner-summary-heading"><div><strong>{data.partner.partner.firstName} {data.partner.partner.lastName}</strong><span className={`presence-label ${data.partner.presence.online ? "online" : "offline"}`}><i aria-hidden="true" />{data.partner.presence.status}{data.partner.status !== data.partner.presence.status ? ` / ${data.partner.status}` : ""}</span></div><FiActivity aria-hidden="true" /></div><div className="partner-summary-stats">{data.partner.study && <span>Study <strong>{formatMinutes(data.partner.study.weekMinutes)}</strong></span>}{data.partner.homework && <span>Homework <strong>{data.partner.homework.completed} / {data.partner.homework.total}</strong></span>}{data.partner.workout && <span>Workouts <strong>{data.partner.workout.weekCompleted}</strong></span>}</div>{data.partner.activity.length > 0 && <p className="partner-summary-activity">{data.partner.activity[0].message}</p>}</> : <div className="partner-summary-empty"><span>No partner connected yet.</span><Link className="secondary-button" to="/partner">Connect a partner</Link></div>}</article></section>

            <section className="dashboard-section" aria-labelledby="upcoming-heading"><div className="section-header"><div><p className="eyebrow">Upcoming</p><h2 id="upcoming-heading">Next events and planned workouts</h2></div></div><article className="dashboard-card"><div className="overview-list">{data.upcoming.length ? data.upcoming.slice(0, 6).map((event) => <div className="upcoming-row" key={event.id}><div><strong>{event.title}</strong><span>{readableDate(event.date)} / {event.startTime}</span></div><span className={`category-label category-${event.type}`}>{eventLabel(event.type)}</span></div>) : <p className="empty-state">Nothing upcoming is scheduled.</p>}</div></article></section>
        </>}
    </main>;
}
