import { formatMinutes, toDateKey } from "../../utils/date";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import type { Workout } from "../../types/productivity";

type WeeklyWorkoutScheduleProps = {
    days: Date[];
    workouts: Workout[];
    onPrevious: () => void;
    onToday: () => void;
    onNext: () => void;
    onComplete: (workout: Workout) => void;
    onReopen: (workout: Workout) => void;
    onEdit: (workout: Workout) => void;
};

export function WeeklyWorkoutSchedule({ days, workouts, onPrevious, onToday, onNext, onComplete, onReopen, onEdit }: WeeklyWorkoutScheduleProps) {
    const today = toDateKey(new Date());
    return <article className="tracking-card weekly-workout-card">
        <div className="section-header"><div><p className="eyebrow">Scheduled instances</p><h2>This week</h2></div><div className="week-navigation"><button className="icon-button" type="button" onClick={onPrevious} aria-label="Previous week" title="Previous week"><FiChevronLeft aria-hidden="true" /></button><button className="small-button" type="button" onClick={onToday}>This week</button><button className="icon-button" type="button" onClick={onNext} aria-label="Next week" title="Next week"><FiChevronRight aria-hidden="true" /></button></div></div>
        <div className="weekly-workout-grid">
            {days.map((date) => {
                const key = toDateKey(date);
                const dayWorkouts = workouts.filter((item) => item.date === key);
                return <section className={`weekly-workout-day ${key === today ? "today" : ""}`} key={key}>
                    <div className="weekly-workout-date"><span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong></div>
                    {dayWorkouts.length ? <div className="weekly-workout-items">{dayWorkouts.map((workout) => {
                        const missed = !workout.completed && workout.date < today;
                        return <div className="weekly-workout-content" key={workout.id}><strong>{workout.name}</strong><span>{workout.startTime} / {formatMinutes(workout.plannedMinutes)}</span><span className={`status-badge ${workout.completed ? "status-completed" : missed ? "status-missed" : "status-in-progress"}`}>{workout.completed ? "Completed" : missed ? "Missed" : "Planned"}</span>{!workout.completed && !missed && <button className="small-button" type="button" onClick={() => onComplete(workout)}>Log workout</button>}{workout.completed && <button className="small-button" type="button" onClick={() => onReopen(workout)}>Reopen</button>}{workout.source !== "recurring" && <button className="small-button" type="button" onClick={() => onEdit(workout)}>Edit</button>}</div>;
                    })}</div> : <span className="rest-label">Rest</span>}
                </section>;
            })}
        </div>
    </article>;
}
