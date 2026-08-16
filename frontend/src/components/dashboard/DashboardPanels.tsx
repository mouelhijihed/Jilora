import { Link } from "react-router-dom";
import { FiCheckCircle, FiCircle } from "react-icons/fi";
import type { CalendarEvent } from "../../types/planner";

type DashboardPanelsProps = {
    todayEvents: CalendarEvent[];
    upcomingEvents: CalendarEvent[];
    studySummary: string;
    internshipSummary: string;
    homeworkSummary: string;
    weeklyGymCompleted: number;
    weeklyGymPlanned: number;
    weeklyGymSummary: string;
    weeklyCompletion: number;
};

function readableDate(date: string) {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

export function DashboardPanels(props: DashboardPanelsProps) {
    return (
        <div className="dashboard-sections">
            <section className="dashboard-grid dashboard-primary-grid">
                <article className="dashboard-card">
                    <div className="section-header"><div><p className="eyebrow">Today</p><h2>Tasks</h2></div></div>
                    <div className="overview-list">
                        {props.todayEvents.length ? props.todayEvents.map((event) => (
                            <div className={`overview-row ${event.completed ? "completed" : ""}`} key={event.id}>
                                <span className="task-state" aria-hidden="true">{event.completed ? <FiCheckCircle /> : <FiCircle />}</span>
                                <div><strong>{event.title}</strong><span>{event.type}</span></div>
                            </div>
                        )) : <p className="empty-state">No tasks or activities planned today.</p>}
                    </div>
                </article>
                <article className="dashboard-card">
                    <div className="section-header"><div><p className="eyebrow">Today</p><h2>Schedule</h2></div><Link className="text-link" to="/planner">Open planner</Link></div>
                    <div className="overview-list">
                        {props.todayEvents.length ? props.todayEvents.map((event) => (
                            <div className={`schedule-row event-accent-${event.type} ${event.completed ? "completed" : ""}`} key={event.id}>
                                <time>{event.startTime}</time><div><strong>{event.title}</strong><span>{event.endTime} / {event.type}</span></div>
                            </div>
                        )) : <p className="empty-state">Your day is open.</p>}
                    </div>
                </article>
            </section>

            <section className="dashboard-grid dashboard-secondary-grid">
                <article className="dashboard-card">
                    <div className="section-header"><div><p className="eyebrow">This week</p><h2>Progress</h2></div><strong className="completion-rate">{props.weeklyCompletion}% complete</strong></div>
                    <div className="weekly-summary">
                        <div><span>Study</span><strong>{props.studySummary}</strong></div>
                        <div><span>Internship</span><strong>{props.internshipSummary}</strong></div>
                        <div><span>Homework</span><strong>{props.homeworkSummary}</strong></div>
                        <div><span>Gym</span><strong>{props.weeklyGymCompleted} / {props.weeklyGymPlanned}</strong><small>{props.weeklyGymSummary} actual</small></div>
                    </div>
                </article>
                <article className="dashboard-card">
                    <div className="section-header"><div><p className="eyebrow">Next up</p><h2>Upcoming</h2></div></div>
                    <div className="overview-list">
                        {props.upcomingEvents.length ? props.upcomingEvents.map((event) => (
                            <div className="upcoming-row" key={event.id}><div><strong>{event.title}</strong><span>{readableDate(event.date)} / {event.startTime}</span></div><span className={`category-label category-${event.type}`}>{event.type}</span></div>
                        )) : <p className="empty-state">No upcoming deadlines or plans.</p>}
                    </div>
                </article>
            </section>
        </div>
    );
}
