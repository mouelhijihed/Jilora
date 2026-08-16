import { useMemo } from "react";
import { DashboardOverview } from "../components/dashboard/DashboardOverview";
import { DashboardPanels } from "../components/dashboard/DashboardPanels";
import { usePlanner } from "../hooks/usePlanner";
import { useProductivity } from "../hooks/useProductivity";
import { useSessions } from "../hooks/useSessions";
import { calculateCompletionRate, eventActualMinutes, getUpcomingEvents } from "../utils/analytics";
import { formatMinutes, startOfCalendarWeek, toDateKey } from "../utils/date";
import "./Dashboard.css";

export function Dashboard() {
    const planner = usePlanner();
    const productivity = useProductivity();
    const activity = useSessions();
    const today = toDateKey(new Date());
    const weekStartDate = startOfCalendarWeek(new Date());
    const weekStart = toDateKey(weekStartDate);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = toDateKey(weekEndDate);
    const weekEvents = planner.events.filter((event) => event.date >= weekStart && event.date <= weekEnd);
    const todayEvents = useMemo(() => planner.events.filter((event) => event.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)), [planner.events, today]);
    const upcomingEvents = getUpcomingEvents(planner.events).slice(0, 6);
    const completedActivitySessions = activity.sessions.filter((session) => session.status === "completed");
    const sessionMinutes = (session: (typeof completedActivitySessions)[number]) => Math.round(session.actualDuration / 60);
    const sessionDate = (session: (typeof completedActivitySessions)[number]) => toDateKey(new Date(session.completedAt || session.startedAt));
    const sessionsToday = completedActivitySessions.filter((session) => sessionDate(session) === today);
    const sessionsThisWeek = completedActivitySessions.filter((session) => sessionDate(session) >= weekStart && sessionDate(session) <= weekEnd);

    const todayStudySessions = sessionsToday.filter((session) => session.activity === "study" && session.sessionType === "focus");
    const todayStudyMinutes = productivity.studySessions.filter((session) => session.date === today).reduce((sum, session) => sum + session.actualMinutes, 0)
        + todayStudySessions.reduce((sum, session) => sum + sessionMinutes(session), 0);
    const todayInternshipMinutes = productivity.internshipDays.filter((day) => day.date === today).reduce((sum, day) => sum + day.actualMinutes, 0)
        + sessionsToday.filter((session) => session.activity === "internship").reduce((sum, session) => sum + sessionMinutes(session), 0);
    const homeworkDueToday = productivity.homeworkTasks.filter((task) => task.dueDate === today);
    const homeworkCompletedToday = homeworkDueToday.filter((task) => task.status === "completed").length;
    const todayWorkout = productivity.workouts.filter((workout) => workout.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

    const studyWeek = productivity.studySessions.filter((session) => session.date >= weekStart && session.date <= weekEnd).reduce((sum, session) => sum + session.actualMinutes, 0)
        + sessionsThisWeek.filter((session) => session.activity === "study" && session.sessionType === "focus").reduce((sum, session) => sum + sessionMinutes(session), 0);
    const internshipWeek = productivity.internshipDays.filter((day) => day.date >= weekStart && day.date <= weekEnd).reduce((sum, day) => sum + day.actualMinutes, 0)
        + sessionsThisWeek.filter((session) => session.activity === "internship").reduce((sum, session) => sum + sessionMinutes(session), 0);
    const homeworkWeek = sessionsThisWeek.filter((session) => session.activity === "homework").reduce((sum, session) => sum + sessionMinutes(session), 0);
    const weeklyWorkouts = productivity.workouts.filter((workout) => workout.date >= weekStart && workout.date <= weekEnd);
    const weeklyGymCompleted = weeklyWorkouts.filter((workout) => workout.completed).length;
    const weeklyGymMinutes = weeklyWorkouts.filter((workout) => workout.completed).reduce((sum, workout) => sum + (workout.actualMinutes || 0), 0);

    const plannedToday = todayEvents.reduce((sum, event) => sum + event.duration, 0);
    const trackedToday = todayEvents.filter((event) => event.completed).reduce((sum, event) => sum + eventActualMinutes(event, productivity.studySessions, productivity.internshipDays, productivity.workouts), 0)
        + sessionsToday.filter((session) => !(session.activity === "gym" && session.workoutId)).reduce((sum, session) => sum + sessionMinutes(session), 0);

    const metrics = [
        { label: "Study today", value: formatMinutes(todayStudyMinutes), description: `${todayStudySessions.length} completed Pomodoros` },
        { label: "Internship today", value: formatMinutes(todayInternshipMinutes), description: "Actual tracked time" },
        { label: "Homework today", value: `${homeworkCompletedToday} / ${homeworkDueToday.length}`, description: homeworkDueToday.length ? "Assignments completed" : "Nothing due today" },
        { label: "Gym today", value: todayWorkout ? (todayWorkout.completed ? "Completed" : "Planned") : "Rest", description: todayWorkout?.name ?? "No workout scheduled" },
    ];

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    return (
        <main className="dashboard page-shell">
            <header className="dashboard-header">
                <div><p className="eyebrow">Overview</p><h1>{greeting}, Jihed</h1><p>{formatMinutes(trackedToday)} tracked from {formatMinutes(plannedToday)} planned today.</p></div>
                <time className="dashboard-date">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</time>
            </header>
            {(planner.error || productivity.error || activity.error) && <div className="notice notice-error" role="alert">{planner.error || productivity.error || activity.error}</div>}
            <DashboardOverview metrics={metrics} />
            <DashboardPanels
                todayEvents={todayEvents}
                upcomingEvents={upcomingEvents}
                studySummary={formatMinutes(studyWeek)}
                internshipSummary={formatMinutes(internshipWeek)}
                homeworkSummary={formatMinutes(homeworkWeek)}
                weeklyGymCompleted={weeklyGymCompleted}
                weeklyGymPlanned={weeklyWorkouts.length}
                weeklyGymSummary={formatMinutes(weeklyGymMinutes)}
                weeklyCompletion={calculateCompletionRate(weekEvents)}
            />
        </main>
    );
}
