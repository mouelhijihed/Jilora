export function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function fromDateKey(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
}

export function addMonths(date: Date, amount: number) {
    const result = new Date(date);
    result.setDate(1);
    result.setMonth(result.getMonth() + amount);
    return result;
}

export function startOfCalendarWeek(date: Date) {
    const result = new Date(date);
    const weekday = result.getDay() || 7;
    result.setDate(result.getDate() - weekday + 1);
    result.setHours(0, 0, 0, 0);
    return result;
}

export function getMonthGrid(date: Date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = startOfCalendarWeek(first);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function getWeekDays(date: Date) {
    const start = startOfCalendarWeek(date);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function formatPeriodLabel(date: Date, view: "month" | "week" | "day") {
    if (view === "month") return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
    if (view === "day") return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
    const days = getWeekDays(date);
    const first = days[0];
    const last = days[6];
    const firstLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(first);
    const lastLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(last);
    return `${firstLabel} - ${lastLabel}`;
}

export function formatMinutes(minutes: number) {
    const sign = minutes < 0 ? "-" : "";
    const absoluteMinutes = Math.abs(Math.round(minutes));
    const hours = Math.floor(absoluteMinutes / 60);
    const remainder = absoluteMinutes % 60;
    if (!hours) return `${sign}${remainder}m`;
    return remainder ? `${sign}${hours}h ${remainder}m` : `${sign}${hours}h`;
}

export function calculateDuration(startTime: string, endTime: string) {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    return Math.max(0, ((endHour * 60) + endMinute) - ((startHour * 60) + startMinute));
}
