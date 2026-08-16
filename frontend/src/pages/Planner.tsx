import { useEffect, useState } from "react";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar";
import { EventEditor } from "../components/calendar/EventEditor";
import { PlannerCalendar } from "../components/calendar/PlannerCalendar";
import { usePlanner } from "../hooks/usePlanner";
import { useProductivity } from "../hooks/useProductivity";
import { addDays, addMonths, formatPeriodLabel, getMonthGrid, getWeekDays, toDateKey } from "../utils/date";
import type { CalendarEvent, CalendarEventInput, CalendarView } from "../types/planner";
import "./Planner.css";

export function Planner() {
    const { events, loading, error, createEvent, updateEvent, deleteEvent, refreshEvents } = usePlanner();
    const { refreshData } = useProductivity();
    const [view, setView] = useState<CalendarView>("month");
    const [currentDate, setCurrentDate] = useState(new Date());
    const [editorOpen, setEditorOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [initialDate, setInitialDate] = useState(toDateKey(new Date()));

    useEffect(() => {
        const days = view === "month" ? getMonthGrid(currentDate) : view === "week" ? getWeekDays(currentDate) : [currentDate];
        void refreshEvents(toDateKey(days[0]), toDateKey(days[days.length - 1]));
    }, [currentDate, refreshEvents, view]);

    function openCreate(date = toDateKey(currentDate)) {
        setSelectedEvent(null);
        setInitialDate(date);
        setEditorOpen(true);
    }

    function navigate(direction: -1 | 1) {
        if (view === "month") setCurrentDate((date) => addMonths(date, direction));
        else if (view === "week") setCurrentDate((date) => addDays(date, direction * 7));
        else setCurrentDate((date) => addDays(date, direction));
    }

    async function saveEvent(input: CalendarEventInput) {
        if (selectedEvent) {
            await updateEvent(selectedEvent.id, input);
            await refreshData();
        } else await createEvent(input);
    }

    async function removeEvent() {
        if (!selectedEvent) return;
        await deleteEvent(selectedEvent.id);
        await refreshData();
    }

    return (
        <main className="planner-page page-shell">
            <header className="planner-header">
                <div><p className="eyebrow">Single source of truth</p><h1>Planner</h1><p>All study, work, training, homework, and personal plans in one calendar.</p></div>
                <div className="category-legend" aria-label="Event categories">
                    {(["study", "internship", "gym", "homework", "general"] as const).map((type) => <span className={`legend-${type}`} key={type}>{type}</span>)}
                </div>
            </header>

            {error && <div className="notice notice-error" role="alert">{error}</div>}
            <CalendarToolbar label={formatPeriodLabel(currentDate, view)} view={view} onViewChange={setView} onPrevious={() => navigate(-1)} onNext={() => navigate(1)} onToday={() => setCurrentDate(new Date())} onCreate={() => openCreate()} />
            {loading ? <div className="calendar-loading">Loading planner...</div> : <PlannerCalendar events={events} currentDate={currentDate} view={view} onSelectEvent={(event) => { setSelectedEvent(event); setEditorOpen(true); }} onCreateEvent={openCreate} />}

            {editorOpen && <EventEditor event={selectedEvent} initialDate={initialDate} onClose={() => setEditorOpen(false)} onSave={saveEvent} onDelete={selectedEvent ? removeEvent : null} />}
        </main>
    );
}
