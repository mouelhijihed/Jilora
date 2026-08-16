import { useEffect, useMemo, useState } from "react";
import { AnalyticsCharts } from "../components/analytics/AnalyticsCharts";
import { AnalyticsFilters } from "../components/analytics/AnalyticsFilters";
import type { DistributionRow, ProgressRow } from "../components/analytics/AnalyticsCharts";
import type { RangeOption } from "../components/analytics/AnalyticsFilters";
import { usePlanner } from "../hooks/usePlanner";
import { useProductivity } from "../hooks/useProductivity";
import { useSessions } from "../hooks/useSessions";
import { endOfDay, endOfMonth, eventActualMinutes, isWithinDates, startOfMonth } from "../utils/analytics";
import { addDays, formatMinutes, fromDateKey, startOfCalendarWeek, toDateKey } from "../utils/date";
import type { CalendarEventType } from "../types/planner";
import "./Analytics.css";

function getRange(option: RangeOption, customStart: string, customEnd: string) {
    const now = new Date();
    if (option === "this-week") { const start = startOfCalendarWeek(now); return { start, end: endOfDay(addDays(start, 6)) }; }
    if (option === "last-week") { const start = addDays(startOfCalendarWeek(now), -7); return { start, end: endOfDay(addDays(start, 6)) }; }
    if (option === "this-month") return { start: startOfMonth(now), end: endOfMonth(now) };
    if (option === "last-month") { const date = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { start: startOfMonth(date), end: endOfMonth(date) }; }
    const first = customStart ? fromDateKey(customStart) : startOfCalendarWeek(now);
    const second = customEnd ? fromDateKey(customEnd) : now;
    return first <= second ? { start: first, end: endOfDay(second) } : { start: second, end: endOfDay(first) };
}

export function Analytics() {
    const { events } = usePlanner();
    const { subjects, studySessions, internshipDays, workouts, ensureWorkoutSchedule } = useProductivity();
    const { sessions } = useSessions();
    const [rangeOption, setRangeOption] = useState<RangeOption>("this-week");
    const [customStart, setCustomStart] = useState(toDateKey(startOfCalendarWeek(new Date())));
    const [customEnd, setCustomEnd] = useState(toDateKey(new Date()));
    const { start, end } = getRange(rangeOption, customStart, customEnd);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);

    useEffect(() => { void ensureWorkoutSchedule(startKey, endKey); }, [endKey, ensureWorkoutSchedule, startKey]);
    const filteredEvents = useMemo(() => events.filter((event) => isWithinDates(event.date, start, end)), [end, events, start]);
    const filteredStudy = useMemo(() => studySessions.filter((session) => isWithinDates(session.date, start, end)), [end, start, studySessions]);
    const filteredInternship = useMemo(() => internshipDays.filter((day) => isWithinDates(day.date, start, end)), [end, internshipDays, start]);
    const filteredWorkouts = useMemo(() => workouts.filter((workout) => isWithinDates(workout.date, start, end)), [end, start, workouts]);
    const filteredActivitySessions = useMemo(() => sessions.filter((session) => session.status === "completed" && isWithinDates(toDateKey(new Date(session.completedAt || session.startedAt)), start, end)), [end, sessions, start]);
    const studyPomodoros = useMemo(() => filteredActivitySessions.filter((session) => session.activity === "study" && session.sessionType === "focus"), [filteredActivitySessions]);
    const internshipActivity = useMemo(() => filteredActivitySessions.filter((session) => session.activity === "internship"), [filteredActivitySessions]);
    const gymActivity = useMemo(() => filteredActivitySessions.filter((session) => session.activity === "gym" && !session.workoutId), [filteredActivitySessions]);
    const homeworkActivity = useMemo(() => filteredActivitySessions.filter((session) => session.activity === "homework"), [filteredActivitySessions]);
    const productiveActivity = useMemo(() => [...studyPomodoros, ...internshipActivity, ...gymActivity, ...homeworkActivity], [gymActivity, homeworkActivity, internshipActivity, studyPomodoros]);

    const dailyData = useMemo(() => {
        const rows = [];
        for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
            const key = toDateKey(date);
            const dayEvents = filteredEvents.filter((event) => event.date === key);
            const hours = (type: CalendarEventType) => dayEvents.filter((event) => event.type === type).reduce((sum, event) => sum + eventActualMinutes(event, studySessions, internshipDays, workouts), 0) / 60;
            const activityHours = (items: typeof filteredActivitySessions) => items.filter((session) => toDateKey(new Date(session.completedAt || session.startedAt)) === key).reduce((sum, session) => sum + session.actualDuration, 0) / 3600;
            rows.push({ date: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date), Study: hours("study") + activityHours(studyPomodoros), Internship: hours("internship") + activityHours(internshipActivity), Gym: hours("gym") + activityHours(gymActivity), productivity: dayEvents.length ? Math.round((dayEvents.filter((event) => event.completed).length / dayEvents.length) * 100) : 0 });
        }
        return rows;
    }, [end, filteredActivitySessions, filteredEvents, gymActivity, internshipActivity, internshipDays, start, studyPomodoros, studySessions, workouts]);

    const plannedActual = [
        { category: "Study", Planned: filteredStudy.reduce((sum, item) => sum + item.plannedMinutes, 0) / 60, Actual: (filteredStudy.reduce((sum, item) => sum + item.actualMinutes, 0) + studyPomodoros.reduce((sum, session) => sum + Math.round(session.actualDuration / 60), 0)) / 60 },
        { category: "Internship", Planned: filteredInternship.reduce((sum, item) => sum + item.plannedMinutes, 0) / 60, Actual: (filteredInternship.reduce((sum, item) => sum + item.actualMinutes, 0) / 60) + internshipActivity.reduce((sum, session) => sum + session.actualDuration, 0) / 3600 },
        { category: "Gym", Planned: filteredWorkouts.reduce((sum, item) => sum + item.plannedMinutes, 0) / 60, Actual: (filteredWorkouts.filter((item) => item.completed).reduce((sum, item) => sum + (item.actualMinutes || 0), 0) / 60) + gymActivity.reduce((sum, session) => sum + session.actualDuration, 0) / 3600 },
    ];
    const studyBySubject = subjects.map((subject) => ({ subject: subject.name, Hours: (filteredStudy.filter((session) => session.subjectId === subject.id).reduce((sum, session) => sum + session.actualMinutes, 0) + studyPomodoros.filter((session) => session.subjectId === subject.id).reduce((sum, session) => sum + Math.round(session.actualDuration / 60), 0)) / 60 })).sort((a, b) => b.Hours - a.Hours);
    const sessionHours = { study: studyPomodoros.reduce((sum, session) => sum + session.actualDuration, 0) / 3600, internship: internshipActivity.reduce((sum, session) => sum + session.actualDuration, 0) / 3600, gym: gymActivity.reduce((sum, session) => sum + session.actualDuration, 0) / 3600, homework: homeworkActivity.reduce((sum, session) => sum + session.actualDuration, 0) / 3600, general: 0 };
    const distribution = (["study", "internship", "gym", "homework", "general"] as CalendarEventType[]).map((type) => ({ name: type === "homework" || type === "general" ? "Other" : type[0].toUpperCase() + type.slice(1), value: filteredEvents.filter((event) => event.type === type).reduce((sum, event) => sum + eventActualMinutes(event, studySessions, internshipDays, workouts), 0) / 60 + sessionHours[type], type })).reduce<DistributionRow[]>((items, item) => { const existing = items.find((entry) => entry.name === item.name); if (existing) existing.value += item.value; else items.push(item); return items; }, []);
    const progressData = useMemo(() => {
        const weeks = new Map<string, number>();
        [...filteredEvents].sort((a, b) => a.date.localeCompare(b.date)).forEach((event) => {
            const label = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(startOfCalendarWeek(fromDateKey(event.date)));
            weeks.set(label, (weeks.get(label) || 0) + (eventActualMinutes(event, studySessions, internshipDays, workouts) / 60));
        });
        productiveActivity.forEach((session) => {
            const period = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(startOfCalendarWeek(fromDateKey(toDateKey(new Date(session.completedAt || session.startedAt)))));
            weeks.set(period, (weeks.get(period) || 0) + session.actualDuration / 3600);
        });
        return [...weeks].map(([period, Hours]): ProgressRow => ({ period, Hours }));
    }, [filteredEvents, internshipDays, productiveActivity, studySessions, workouts]);

    const today = toDateKey(new Date());
    const rangeCompleted = filteredWorkouts.filter((workout) => workout.completed);
    const rangeMissed = filteredWorkouts.filter((workout) => !workout.completed && workout.date < today);
    const thisWeekStart = startOfCalendarWeek(new Date());
    const lastWeekStart = addDays(thisWeekStart, -7);
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const actualForRange = (rangeStart: Date, rangeEnd: Date) => workouts.filter((workout) => workout.completed && isWithinDates(workout.date, rangeStart, endOfDay(rangeEnd))).reduce((sum, workout) => sum + (workout.actualMinutes || 0), 0);
    const historicalWorkouts = workouts.filter((workout) => workout.date <= today);
    const historicalCompleted = historicalWorkouts.filter((workout) => workout.completed);
    const studyTotalMinutes = filteredStudy.reduce((sum, session) => sum + session.actualMinutes, 0) + studyPomodoros.reduce((sum, session) => sum + Math.round(session.actualDuration / 60), 0);
    const studyByDay = filteredStudy.reduce<Record<string, number>>((totals, session) => { totals[session.date] = (totals[session.date] || 0) + session.actualMinutes; return totals; }, {});
    studyPomodoros.forEach((session) => { const key = toDateKey(new Date(session.completedAt || session.startedAt)); studyByDay[key] = (studyByDay[key] || 0) + Math.round(session.actualDuration / 60); });

    return <main className="analytics-page page-shell"><header className="analytics-header"><div><p className="eyebrow">Measured from your records</p><h1>Analytics</h1><p>Compare intent with execution across study, work, training, and tasks.</p></div><AnalyticsFilters rangeOption={rangeOption} customStart={customStart} customEnd={customEnd} onRangeChange={setRangeOption} onStartChange={setCustomStart} onEndChange={setCustomEnd} /></header><section className="study-analytics"><div className="gym-analytics-heading"><div><p className="eyebrow">Study analytics</p><h2>Pomodoro performance</h2></div><strong>{formatMinutes(studyTotalMinutes)}</strong></div><div className="study-analytics-grid"><div><span>Total study time</span><strong>{formatMinutes(studyTotalMinutes)}</strong></div><div><span>Completed Pomodoros</span><strong>{studyPomodoros.length}</strong></div><div><span>Average Pomodoro</span><strong>{formatMinutes(studyPomodoros.length ? Math.round(studyTotalMinutes / studyPomodoros.length) : 0)}</strong></div><div><span>This week</span><strong>{formatMinutes(studyPomodoros.filter((session) => toDateKey(new Date(session.completedAt || session.startedAt)) >= toDateKey(thisWeekStart) && toDateKey(new Date(session.completedAt || session.startedAt)) <= toDateKey(addDays(thisWeekStart, 6))).reduce((sum, session) => sum + Math.round(session.actualDuration / 60), 0))}</strong></div><div><span>This month</span><strong>{formatMinutes(studyPomodoros.filter((session) => new Date(session.completedAt || session.startedAt) >= thisMonthStart).reduce((sum, session) => sum + Math.round(session.actualDuration / 60), 0))}</strong></div></div><div className="study-analytics-lists"><div><h3>By subject</h3>{studyBySubject.length ? studyBySubject.map((row) => <div className="analytics-list-row" key={row.subject}><span>{row.subject}</span><strong>{formatMinutes(Math.round(row.Hours * 60))}</strong></div>) : <p className="chart-empty">Complete a study Pomodoro to populate this list.</p>}</div><div><h3>By day</h3>{Object.entries(studyByDay).length ? Object.entries(studyByDay).map(([date, minutes]) => <div className="analytics-list-row" key={date}><span>{date}</span><strong>{formatMinutes(minutes)}</strong></div>) : <p className="chart-empty">No completed study days in this range.</p>}</div></div></section><section className="gym-analytics"><div className="gym-analytics-heading"><div><p className="eyebrow">Gym</p><h2>Workout performance</h2></div><strong>{filteredWorkouts.length ? `${Math.round((rangeCompleted.length / filteredWorkouts.length) * 1000) / 10}%` : "0%"}</strong></div><div className="gym-analytics-grid"><div><span>Planned in range</span><strong>{filteredWorkouts.length}</strong></div><div><span>Completed</span><strong>{rangeCompleted.length}</strong></div><div><span>Missed</span><strong>{rangeMissed.length}</strong></div><div><span>Actual time</span><strong>{formatMinutes(rangeCompleted.reduce((sum, workout) => sum + (workout.actualMinutes || 0), 0))}</strong></div><div><span>This week</span><strong>{formatMinutes(actualForRange(thisWeekStart, addDays(thisWeekStart, 6)))}</strong></div><div><span>Last week</span><strong>{formatMinutes(actualForRange(lastWeekStart, addDays(lastWeekStart, 6)))}</strong></div><div><span>This month</span><strong>{formatMinutes(actualForRange(thisMonthStart, new Date()))}</strong></div><div><span>Total workouts</span><strong>{historicalWorkouts.length}</strong></div><div><span>Total completed</span><strong>{historicalCompleted.length}</strong></div><div><span>Overall rate</span><strong>{historicalWorkouts.length ? `${Math.round((historicalCompleted.length / historicalWorkouts.length) * 1000) / 10}%` : "0%"}</strong></div></div></section><AnalyticsCharts dailyData={dailyData} plannedActual={plannedActual} studyBySubject={studyBySubject} distribution={distribution} progressData={progressData} /></main>;
}
