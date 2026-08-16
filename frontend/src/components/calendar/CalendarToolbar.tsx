import type { CalendarView } from "../../types/planner";
import { FiChevronLeft, FiChevronRight, FiPlus } from "react-icons/fi";

type CalendarToolbarProps = {
    label: string;
    view: CalendarView;
    onViewChange: (view: CalendarView) => void;
    onPrevious: () => void;
    onNext: () => void;
    onToday: () => void;
    onCreate: () => void;
};

export function CalendarToolbar({ label, view, onViewChange, onPrevious, onNext, onToday, onCreate }: CalendarToolbarProps) {
    return (
        <div className="calendar-toolbar">
            <div className="calendar-navigation">
                <button className="icon-button" type="button" onClick={onPrevious} aria-label="Previous period" title="Previous period"><FiChevronLeft aria-hidden="true" /></button>
                <button className="secondary-button" type="button" onClick={onToday}>Today</button>
                <button className="icon-button" type="button" onClick={onNext} aria-label="Next period" title="Next period"><FiChevronRight aria-hidden="true" /></button>
                <h2>{label}</h2>
            </div>
            <div className="calendar-actions">
                <div className="view-switcher" aria-label="Calendar view">
                    {(["month", "week", "day"] as CalendarView[]).map((option) => (
                        <button className={view === option ? "active" : ""} type="button" onClick={() => onViewChange(option)} key={option}>{option}</button>
                    ))}
                </div>
                <button className="primary-button" type="button" onClick={onCreate}><FiPlus aria-hidden="true" />Add event</button>
            </div>
        </div>
    );
}
