import { CalendarEventCard } from "./CalendarEventCard";
import { FiPlus } from "react-icons/fi";
import { getMonthGrid, getWeekDays, toDateKey } from "../../utils/date";
import type { CalendarEvent, CalendarView } from "../../types/planner";

type PlannerCalendarProps = {
    events: CalendarEvent[];
    currentDate: Date;
    view: CalendarView;
    onSelectEvent: (event: CalendarEvent) => void;
    onCreateEvent: (date: string) => void;
};

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function eventsForDate(events: CalendarEvent[], date: Date) {
    const key = toDateKey(date);
    return events.filter((event) => event.date === key).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function PlannerCalendar({ events, currentDate, view, onSelectEvent, onCreateEvent }: PlannerCalendarProps) {
    const today = toDateKey(new Date());

    if (view === "day") {
        const dateEvents = eventsForDate(events, currentDate);
        return (
            <section className="day-calendar" aria-label="Day schedule">
                <div className="day-heading">
                    <div><span>{new Intl.DateTimeFormat("en", { weekday: "long" }).format(currentDate)}</span><strong>{currentDate.getDate()}</strong></div>
                    <button className="secondary-button" type="button" onClick={() => onCreateEvent(toDateKey(currentDate))}>Add to this day</button>
                </div>
                <div className="day-events">
                    {dateEvents.length === 0 && <button className="calendar-empty" type="button" onClick={() => onCreateEvent(toDateKey(currentDate))}>No plans yet. Add an event.</button>}
                    {dateEvents.map((event) => (
                        <div className="timeline-row" key={event.id}>
                            <time>{event.startTime}<span>{event.endTime}</span></time>
                            <CalendarEventCard event={event} onSelect={onSelectEvent} />
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    if (view === "week") {
        return (
            <section className="week-calendar" aria-label="Week schedule">
                {getWeekDays(currentDate).map((date) => {
                    const dateKey = toDateKey(date);
                    const dateEvents = eventsForDate(events, date);
                    return (
                        <div className={`week-day ${dateKey === today ? "today" : ""}`} key={dateKey}>
                            <button className="week-day-heading" type="button" onClick={() => onCreateEvent(dateKey)}>
                                <span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span>
                                <strong>{date.getDate()}</strong>
                            </button>
                            <div className="week-day-events">
                                {dateEvents.map((event) => <CalendarEventCard compact event={event} onSelect={onSelectEvent} key={event.id} />)}
                                {dateEvents.length === 0 && <button className="add-day-event" type="button" onClick={() => onCreateEvent(dateKey)} aria-label={`Add event on ${dateKey}`} title="Add event"><FiPlus aria-hidden="true" /></button>}
                            </div>
                        </div>
                    );
                })}
            </section>
        );
    }

    return (
        <section className="month-calendar" aria-label="Month calendar">
            {weekdayLabels.map((label) => <div className="month-weekday" key={label}>{label}</div>)}
            {getMonthGrid(currentDate).map((date) => {
                const dateKey = toDateKey(date);
                const dateEvents = eventsForDate(events, date);
                const outsideMonth = date.getMonth() !== currentDate.getMonth();
                return (
                    <div className={`month-day ${outsideMonth ? "outside" : ""} ${dateKey === today ? "today" : ""}`} key={dateKey}>
                        <button className="month-day-number" type="button" onClick={() => onCreateEvent(dateKey)} aria-label={`Add event on ${dateKey}`}>{date.getDate()}</button>
                        <div className="month-day-events">
                            {dateEvents.slice(0, 3).map((event) => <CalendarEventCard compact event={event} onSelect={onSelectEvent} key={event.id} />)}
                            {dateEvents.length > 3 && <span className="more-events">+{dateEvents.length - 3} more</span>}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}
