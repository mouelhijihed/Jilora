import type { ReactNode } from "react";
import { FiX } from "react-icons/fi";
import "./ModalForm.css";

type ModalFormProps = {
    eyebrow: string;
    title: string;
    children: ReactNode;
    onClose: () => void;
};

export function ModalForm({ eyebrow, title, children, onClose }: ModalFormProps) {
    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <section className="event-editor" role="dialog" aria-modal="true" aria-labelledby="domain-editor-title">
                <div className="modal-header">
                    <div><p className="eyebrow">{eyebrow}</p><h2 id="domain-editor-title">{title}</h2></div>
                    <button className="icon-button" type="button" onClick={onClose} aria-label="Close" title="Close"><FiX aria-hidden="true" /></button>
                </div>
                {children}
            </section>
        </div>
    );
}
