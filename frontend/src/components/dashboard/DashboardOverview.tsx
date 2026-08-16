export type OverviewMetric = {
    label: string;
    value: string;
    description: string;
};

export function DashboardOverview({ metrics }: { metrics: OverviewMetric[] }) {
    return (
        <section className="stats-grid" aria-label="Productivity overview">
            {metrics.map((metric) => (
                <article className="stat-card" key={metric.label}>
                    <span className="stat-label">{metric.label}</span>
                    <strong className="stat-value">{metric.value}</strong>
                    <span className="stat-description">{metric.description}</span>
                </article>
            ))}
        </section>
    );
}
