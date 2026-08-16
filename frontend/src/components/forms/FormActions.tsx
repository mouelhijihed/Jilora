type FormActionsProps = {
    saving: boolean;
    submitLabel: string;
    onCancel: () => void;
    onDelete?: () => void;
};

export function FormActions({ saving, submitLabel, onCancel, onDelete }: FormActionsProps) {
    return (
        <div className="modal-actions">
            {onDelete ? <button className="danger-button" type="button" onClick={onDelete} disabled={saving}>Delete</button> : <span />}
            <span />
            <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : submitLabel}</button>
        </div>
    );
}
