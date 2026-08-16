import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type DailyChartRow = { date: string; Study: number; Internship: number; Gym: number; productivity: number };
export type PlannedActualRow = { category: string; Planned: number; Actual: number };
export type DistributionRow = { name: string; value: number; type: "study" | "internship" | "gym" | "homework" | "general" };
export type ProgressRow = { period: string; Hours: number };

const colors = {
    study: "var(--study)",
    internship: "var(--internship)",
    gym: "var(--gym)",
    homework: "var(--homework)",
    general: "var(--general)",
};
const axisTick = { fill: "var(--text-muted)", fontSize: 11 };
const tooltipContentStyle = { background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 12 };
const tooltipLabelStyle = { color: "var(--text-primary)", fontWeight: 700 };
const tooltipItemStyle = { color: "var(--text-secondary)" };
const legendStyle = { color: "var(--text-secondary)", fontSize: 11 };

type AnalyticsChartsProps = {
    dailyData: DailyChartRow[];
    plannedActual: PlannedActualRow[];
    studyBySubject: { subject: string; Hours: number }[];
    distribution: DistributionRow[];
    progressData: ProgressRow[];
};

function ChartTooltip() {
    return <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: "rgba(124, 156, 255, .07)" }} />;
}

function ChartGrid() {
    return <CartesianGrid vertical={false} stroke="var(--chart-grid)" />;
}

export function AnalyticsCharts({ dailyData, plannedActual, studyBySubject, distribution, progressData }: AnalyticsChartsProps) {
    const hasDistribution = distribution.some((item) => item.value > 0);
    return <section className="chart-grid">
        <article className="chart-card chart-wide">
            <div className="chart-heading"><h2>Weekly hours</h2><span>Actual hours by day</span></div>
            <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={dailyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}><ChartGrid /><XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} /><YAxis unit="h" tick={axisTick} tickLine={false} axisLine={false} /><ChartTooltip /><Legend wrapperStyle={legendStyle} iconSize={8} /><Line isAnimationActive={false} type="monotone" dataKey="Study" stroke={colors.study} strokeWidth={2} dot={false} /><Line isAnimationActive={false} type="monotone" dataKey="Internship" stroke={colors.internship} strokeWidth={2} dot={false} /><Line isAnimationActive={false} type="monotone" dataKey="Gym" stroke={colors.gym} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
        </article>
        <article className="chart-card">
            <div className="chart-heading"><h2>Planned vs actual</h2><span>Hours by category</span></div>
            <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={plannedActual} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}><ChartGrid /><XAxis dataKey="category" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} /><YAxis unit="h" tick={axisTick} tickLine={false} axisLine={false} /><ChartTooltip /><Legend wrapperStyle={legendStyle} iconSize={8} /><Bar isAnimationActive={false} dataKey="Planned" fill="var(--chart-planned)" radius={[3, 3, 0, 0]} /><Bar isAnimationActive={false} dataKey="Actual" fill="var(--accent)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </article>
        <article className="chart-card">
            <div className="chart-heading"><h2>Study by subject</h2><span>Actual focused hours</span></div>
            <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={studyBySubject} layout="vertical" margin={{ top: 8, right: 8, left: 4, bottom: 0 }}><ChartGrid /><XAxis type="number" unit="h" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} /><YAxis dataKey="subject" type="category" width={92} tick={axisTick} tickLine={false} axisLine={false} /><ChartTooltip /><Bar isAnimationActive={false} dataKey="Hours" fill={colors.study} radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div>
        </article>
        <article className="chart-card">
            <div className="chart-heading"><h2>Weekly productivity</h2><span>Daily completion rate</span></div>
            <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={dailyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}><ChartGrid /><XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} /><YAxis domain={[0, 100]} unit="%" tick={axisTick} tickLine={false} axisLine={false} /><ChartTooltip /><Line isAnimationActive={false} type="monotone" dataKey="productivity" name="Completion" stroke={colors.homework} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
        </article>
        <article className="chart-card">
            <div className="chart-heading"><h2>Activity distribution</h2><span>Share of tracked hours</span></div>
            <div className="chart-frame pie-frame">{hasDistribution ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={distribution} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2} stroke="var(--surface)">{distribution.map((item) => <Cell fill={colors[item.type]} key={item.name} />)}</Pie><ChartTooltip /><Legend wrapperStyle={legendStyle} iconSize={8} /></PieChart></ResponsiveContainer> : <p className="chart-empty">Complete tracked activities to populate this chart.</p>}</div>
        </article>
        <article className="chart-card chart-wide">
            <div className="chart-heading"><h2>Monthly progress</h2><span>Productive hours grouped by week</span></div>
            <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={progressData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}><ChartGrid /><XAxis dataKey="period" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} /><YAxis unit="h" tick={axisTick} tickLine={false} axisLine={false} /><ChartTooltip /><Line isAnimationActive={false} type="monotone" dataKey="Hours" stroke={colors.general} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
        </article>
    </section>;
}
