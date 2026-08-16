type DashboardQuickActionsProps = {
    onStudy: () => void;
    onWorkout: () => void;
    onInternship: () => void;
    onHomework: () => void;
    onGeneral: () => void;
};

export function DashboardQuickActions({ onStudy, onWorkout, onInternship, onHomework, onGeneral }: DashboardQuickActionsProps) {
    return (
        <section className="quick-actions">
            <div><p className="eyebrow">Quick actions</p><h2>Plan the next block</h2></div>
            <div className="quick-action-buttons">
                <button className="secondary-button" type="button" onClick={onStudy}>Add study session</button>
                <button className="secondary-button" type="button" onClick={onWorkout}>Add workout</button>
                <button className="secondary-button" type="button" onClick={onInternship}>Add internship hours</button>
                <button className="secondary-button" type="button" onClick={onHomework}>Add homework</button>
                <button className="primary-button" type="button" onClick={onGeneral}>Add general event</button>
            </div>
        </section>
    );
}
