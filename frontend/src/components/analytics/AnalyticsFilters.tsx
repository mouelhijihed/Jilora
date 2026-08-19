export type RangeOption = "this-week" | "last-week" | "this-month" | "last-month" | "all-time" | "custom";

type AnalyticsFiltersProps = { rangeOption: RangeOption; customStart: string; customEnd: string; onRangeChange: (value: RangeOption) => void; onStartChange: (value: string) => void; onEndChange: (value: string) => void };

export function AnalyticsFilters({ rangeOption, customStart, customEnd, onRangeChange, onStartChange, onEndChange }: AnalyticsFiltersProps) {
    return <div className="analytics-filters"><select className="select-input" value={rangeOption} onChange={(event) => onRangeChange(event.target.value as RangeOption)}><option value="this-week">This week</option><option value="last-week">Last week</option><option value="this-month">This month</option><option value="last-month">Last month</option><option value="all-time">All time</option><option value="custom">Custom range</option></select>{rangeOption === "custom" && <><input className="text-input" type="date" value={customStart} onChange={(event) => onStartChange(event.target.value)} /><input className="text-input" type="date" value={customEnd} onChange={(event) => onEndChange(event.target.value)} /></>}</div>;
}
