import { formatMinutes } from "../../utils/date";
import type { CalendarEvent } from "../../types/planner";

type CalendarEventCardProps = {
    event: CalendarEvent;
    compact?: boolean;
    onSelect: (event: CalendarEvent) => void;
};

export function CalendarEventCard({ event, compact = false, onSelect }: CalendarEventCardProps) {
    return (
        <button className={`calendar-event event-${event.type} ${event.completed ? "completed" : ""} ${compact ? "compact" : ""}`} type="button" onClick={() => onSelect(event)}>
            <span className="event-time">{event.startTime}</span>
            <span className="event-title">{event.title}</span>
            {!compact && <span className="event-duration">{formatMinutes(event.duration)}</span>}
        </button>
    );
}
