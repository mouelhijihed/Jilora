import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { FiBell, FiCheck, FiClock, FiEdit2, FiHeart, FiPause, FiPlay, FiPlus, FiRefreshCw, FiSend, FiSettings, FiTrash2, FiUserPlus, FiUsers, FiX } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { subscribeRealtime } from "../hooks/useRealtime";
import { apiRequest } from "../services/api";
import { partnerService } from "../services/partnerService";
import type { GoalInput } from "../services/partnerService";
import type { PartnerSettings, PartnerSharedData, PartnerState, SharedGoal } from "../types/partner";
import { formatMinutes } from "../utils/date";
import "./Tracking.css";
import "./Partner.css";

type SubjectOption = { id: string; name: string };
type ProductivitySubjects = { subjects: SubjectOption[] };

const encouragements = ["Keep going", "You've got this", "Nice work", "Start another session", "Great job"] as const;

function dateInput(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, count: number) { const next = new Date(date); next.setDate(next.getDate() + count); return next; }
function fullName(person: { firstName: string; lastName: string }) { return `${person.firstName} ${person.lastName}`.trim(); }
function timeAgo(value: string) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}
function timerValue(seconds: number) { const safe = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`; }
function goalTypeLabel(type: SharedGoal["type"]) { return type === "study_minutes" ? "study hours" : type.replaceAll("_", " "); }
function goalValue(value: number, type: SharedGoal["type"]) { return type === "study_minutes" ? `${Math.round(value * 100) / 100}h` : String(value); }

export function Partner() {
    const { user } = useAuth();
    const [state, setState] = useState<PartnerState | null>(null);
    const [shared, setShared] = useState<PartnerSharedData | null>(null);
    const [settings, setSettings] = useState<PartnerSettings | null>(null);
    const [goals, setGoals] = useState<SharedGoal[]>([]);
    const [subjects, setSubjects] = useState<SubjectOption[]>([]);
    const [identifier, setIdentifier] = useState("");
    const [sessionSubject, setSessionSubject] = useState("");
    const [sessionDuration, setSessionDuration] = useState(25);
    const [customDuration, setCustomDuration] = useState(75);
    const [showSettings, setShowSettings] = useState(false);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
    const [showSessionForm, setShowSessionForm] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState("");
    const [initialLoading, setInitialLoading] = useState(true);
    const [fetchedAt, setFetchedAt] = useState(Date.now());
    const [clock, setClock] = useState(Date.now());
    const today = useMemo(() => new Date(), []);
    const [goalForm, setGoalForm] = useState<GoalInput>({ title: "", type: "study_minutes", target: 20, startDate: dateInput(today), endDate: dateInput(addDays(today, 6)) });

    const load = useCallback(async (showLoading = false) => {
        if (showLoading) setInitialLoading(true);
        try {
            const nextState = await partnerService.state();
            setState(nextState);
            setFetchedAt(Date.now());
            if (nextState.partnership) {
                const [nextShared, nextSettings, nextGoals, productivity] = await Promise.all([
                    partnerService.sharedData(), partnerService.settings(), partnerService.goals(), apiRequest<ProductivitySubjects>("/api/productivity"),
                ]);
                setShared(nextShared); setSettings(nextSettings); setGoals(nextGoals); setSubjects(productivity.subjects || []);
            } else {
                setShared(null); setSettings(null); setGoals([]); setSubjects([]);
            }
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not load partner information");
        } finally { if (showLoading) setInitialLoading(false); }
    }, []);

    useEffect(() => { void load(true); const interval = window.setInterval(() => void load(false), 60000); return () => window.clearInterval(interval); }, [load]);
    useEffect(() => subscribeRealtime((change) => { if (["all", "partner", "sessions", "productivity", "workouts", "presence"].includes(change.scope)) void load(false); }), [load]);
    useEffect(() => { const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, []);

    async function run(key: string, action: () => Promise<unknown>, success?: string) {
        setBusy(key); setError(""); setNotice("");
        try { await action(); if (success) setNotice(success); await load(false); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "The request could not be completed"); }
        finally { setBusy(""); }
    }

    async function sendInvite(event: FormEvent) {
        event.preventDefault();
        if (!identifier.trim()) return;
        await run("invite", () => partnerService.invite(identifier.trim()), "Invitation sent.");
        setIdentifier("");
    }

    async function saveSettings(event: FormEvent) {
        event.preventDefault(); if (!settings) return;
        const { userId: _userId, partnershipId: _partnershipId, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = settings;
        await run("settings", () => partnerService.updateSettings(input), "Sharing settings updated.");
    }

    async function createGoal(event: FormEvent) {
        event.preventDefault();
        const input = { ...goalForm, target: Number(goalForm.target), ...(goalForm.type === "custom" ? { manualProgress: Number(goalForm.manualProgress || 0) } : {}) };
        await run("goal", () => editingGoalId ? partnerService.updateGoal(editingGoalId, input) : partnerService.createGoal(input), editingGoalId ? "Shared goal updated." : "Shared goal created.");
        setGoalForm((current) => ({ ...current, title: "", manualProgress: 0 })); setShowGoalForm(false);
        setEditingGoalId(null);
    }

    function editGoal(goal: SharedGoal) {
        setGoalForm({ title: goal.title, type: goal.type, target: goal.target, manualProgress: goal.manualProgress, startDate: goal.startDate, endDate: goal.endDate });
        setEditingGoalId(goal.id);
        setShowGoalForm(true);
    }

    function closeGoalForm() {
        setShowGoalForm(false);
        setEditingGoalId(null);
        setGoalForm((current) => ({ ...current, title: "", manualProgress: 0 }));
    }

    async function createSession(event: FormEvent) {
        event.preventDefault();
        const duration = sessionDuration === 0 ? customDuration : sessionDuration;
        await run("session-create", () => partnerService.createSession(sessionSubject || undefined, duration), "Study invitation sent.");
        setShowSessionForm(false);
    }

    async function removePartner() {
        if (!window.confirm("Are you sure you want to remove this partner? Personal data will remain intact, but all shared access will end.")) return;
        await run("remove", () => partnerService.remove(), "Partnership removed.");
    }

    async function clearNotificationHistory() {
        setBusy("notifications-clear"); setError(""); setNotice("");
        try {
            await partnerService.clearNotifications();
            setState((current) => current ? { ...current, notifications: [] } : current);
            setNotice("Partner notification history cleared.");
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not clear partner notification history");
        } finally {
            setBusy("");
        }
    }

    if (initialLoading && !state) return <main className="partner-page page-shell"><div className="partner-loading">Loading partner workspace...</div></main>;

    const activeSession = state?.activeSession;
    const elapsed = activeSession ? Math.min(activeSession.durationSeconds, activeSession.elapsedSeconds + (activeSession.status === "active" ? Math.floor((clock - fetchedAt) / 1000) : 0)) : 0;
    const remaining = activeSession ? Math.max(0, activeSession.durationSeconds - elapsed) : 0;
    const selfMember = activeSession?.members.find((member) => member.isSelf);
    const partnerMember = activeSession?.members.find((member) => !member.isSelf);
    const invitedBySelf = Boolean(activeSession && user && activeSession.invitedBy === user.id);
    const unread = state?.notifications.filter((item) => !item.readAt).length || 0;

    return <main className="partner-page page-shell">
        <header className="tracking-header partner-header">
            <div><p className="eyebrow">Private workspace</p><h1>Partner</h1><p>Share only the productivity information you choose.</p></div>
            <button className="icon-button" type="button" onClick={() => void load(false)} disabled={busy === "refresh"} title="Refresh partner data"><FiRefreshCw aria-hidden="true" /></button>
        </header>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {notice && <div className="notice" role="status">{notice}</div>}

        {!state?.partnership ? <section className="partner-connect" aria-labelledby="connect-heading">
            <div className="partner-connect-copy"><span className="partner-icon"><FiUsers aria-hidden="true" /></span><div><h2 id="connect-heading">Connect with someone and keep each other accountable.</h2><p>Your dashboards stay independent. Nothing is shared until both people connect, and every sharing category remains under individual control.</p></div></div>

            {state?.incomingInvitations.map((invitation) => <article className="invitation-panel received" key={invitation.id}><div><p className="eyebrow">Partner invitation</p><h3>{fullName(invitation.sender!)}</h3><p>@{invitation.sender?.username} wants to become your partner.</p></div><div className="partner-actions"><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void run(`decline-${invitation.id}`, () => partnerService.decline(invitation.id), "Invitation declined.")}><FiX aria-hidden="true" />Decline</button><button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => void run(`accept-${invitation.id}`, () => partnerService.accept(invitation.id), "Partner connected.")}><FiCheck aria-hidden="true" />Accept</button></div></article>)}

            {state?.outgoingInvitations.map((invitation) => <article className="invitation-panel" key={invitation.id}><div><p className="eyebrow">Invitation pending</p><h3>{fullName(invitation.receiver!)}</h3><p>Waiting for @{invitation.receiver?.username} to respond.</p></div><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void run(`cancel-${invitation.id}`, () => partnerService.cancelInvitation(invitation.id), "Invitation cancelled.")}><FiX aria-hidden="true" />Cancel invitation</button></article>)}

            {!state?.outgoingInvitations.length && <form className="partner-invite-form" onSubmit={sendInvite}><label><span className="field-label">Email or username</span><div className="partner-inline-form"><input className="text-input" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="partner@example.com or username" minLength={3} maxLength={320} required /><button className="primary-button" type="submit" disabled={busy === "invite"}><FiUserPlus aria-hidden="true" />{busy === "invite" ? "Sending..." : "Send invitation"}</button></div></label></form>}
        </section> : <>
            <section className="partner-identity" aria-label="Partnership overview">
                <div><p className="eyebrow">Partnered with</p><h2>{fullName(state.partnership.partner)}</h2><span>@{state.partnership.partner.username}</span>{shared && <span className={`presence-label ${shared.partner.presence.online ? "online" : "offline"}`}><i aria-hidden="true" />{shared.partner.presence.status}</span>}</div>
                <div className="partner-actions"><button className="secondary-button" type="button" onClick={() => setShowSettings((current) => !current)}><FiSettings aria-hidden="true" />Manage sharing</button><button className="danger-button" type="button" onClick={() => void removePartner()} disabled={busy === "remove"}><FiTrash2 aria-hidden="true" />Remove partner</button></div>
            </section>

            {showSettings && settings && <form className="partner-settings" onSubmit={saveSettings}><div className="section-header"><div><p className="eyebrow">Privacy</p><h2>Partner sharing</h2></div><button className="primary-button" type="submit" disabled={busy === "settings"}><FiCheck aria-hidden="true" />{busy === "settings" ? "Saving..." : "Save settings"}</button></div><div className="sharing-list">{([
                ["shareStudyTime", "Study time", "Weekly and daily totals"], ["shareStudySubjects", "Study subjects", "Current study subject"], ["shareHomeworkProgress", "Homework progress", "Aggregate completion only"], ["shareGymProgress", "Workout progress", "General workout counts only"], ["shareJobHours", "Part-Time Job hours", "Daily and weekly totals"], ["shareCurrentActivity", "Current activity", "Studying, working, working out, break or offline"], ["shareCalendar", "Calendar", "Upcoming calendar entries"], ["shareDetailedTasks", "Detailed tasks", "Open task titles"], ["shareDetailedWorkouts", "Detailed workout data", "Upcoming workout names"],
            ] as const).map(([key, label, description]) => <label className="sharing-row" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={settings[key]} onChange={() => setSettings((current) => current ? { ...current, [key]: !current[key] } : current)} /></label>)}</div></form>}

            {shared && <section className="partner-comparison" aria-labelledby="week-heading"><div className="section-header"><div><p className="eyebrow">This week</p><h2 id="week-heading">Shared overview</h2></div><span className="privacy-note">Partner values follow their sharing settings</span></div><div className="comparison-head"><span>Metric</span><strong>You</strong><strong>{shared.partner.user.firstName}</strong></div><div className="comparison-status"><span>Current activity</span><strong>{shared.self.status}</strong><strong>{shared.partner.status}</strong></div>{shared.partner.study && <div className="comparison-row"><span>Study<strong>{shared.partner.study.currentSubject ? `Current: ${shared.partner.study.currentSubject}` : "Focus time"}</strong></span><b>{formatMinutes(shared.self.study?.weekMinutes || 0)}</b><b>{formatMinutes(shared.partner.study.weekMinutes)}</b></div>}{shared.partner.homework && <div className="comparison-row"><span>Homework<strong>Completed / total</strong></span><b>{shared.self.homework?.completed || 0} / {shared.self.homework?.total || 0}</b><b>{shared.partner.homework.completed} / {shared.partner.homework.total}</b></div>}{shared.partner.gym && <div className="comparison-row"><span>Workouts<strong>Completed this week</strong></span><b>{shared.self.gym?.weekCompleted || 0}</b><b>{shared.partner.gym.weekCompleted}</b></div>}{shared.partner.job && <div className="comparison-row"><span>Part-Time Job<strong>Hours logged</strong></span><b>{formatMinutes(shared.self.job?.weekMinutes || 0)}</b><b>{formatMinutes(shared.partner.job.weekMinutes)}</b></div>}</section>}

            <section className="partner-main-grid">
                <div className="partner-column">
                    <section className="partner-section" aria-labelledby="session-heading"><div className="section-header"><div><p className="eyebrow">Focus</p><h2 id="session-heading">Study together</h2></div>{!activeSession && <button className="primary-button" type="button" onClick={() => setShowSessionForm((current) => !current)}><FiPlay aria-hidden="true" />Start session</button>}</div>
                        {showSessionForm && !activeSession && <form className="partner-compact-form" onSubmit={createSession}>{settings?.shareStudySubjects && <label><span className="field-label">Subject (optional)</span><select className="select-input" value={sessionSubject} onChange={(event) => setSessionSubject(event.target.value)}><option value="">No subject</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>}<fieldset className="duration-options"><legend className="field-label">Duration</legend>{[25, 50, 0].map((duration) => <button className={`duration-option ${sessionDuration === duration ? "selected" : ""}`} type="button" key={duration} onClick={() => setSessionDuration(duration)}>{duration || "Custom"}</button>)}</fieldset>{sessionDuration === 0 && <label><span className="field-label">Minutes</span><input className="text-input" type="number" min={1} max={720} value={customDuration} onChange={(event) => setCustomDuration(Number(event.target.value))} required /></label>}<div className="partner-actions"><button className="secondary-button" type="button" onClick={() => setShowSessionForm(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy === "session-create"}><FiSend aria-hidden="true" />Send invitation</button></div></form>}
                        {activeSession ? <div className="shared-timer"><div className="shared-timer-heading"><span className={`session-state state-${activeSession.status}`}>{activeSession.status}</span><strong>{activeSession.subjectName || "Shared focus session"}</strong><small>{Math.round(activeSession.durationSeconds / 60)} minutes</small></div><div className="timer-display"><FiClock aria-hidden="true" /><span>{timerValue(remaining)}</span></div><div className="session-members">{activeSession.members.map((member) => <div key={member.user.id}><strong>{member.isSelf ? "You" : member.user.firstName}</strong><span>{member.completedAt ? "Completed" : member.leftAt ? "Left" : member.joinedAt ? activeSession.status === "pending" ? "Ready" : "Studying" : "Invited"}</span></div>)}</div><div className="partner-actions session-actions">{activeSession.status === "pending" && !invitedBySelf && !selfMember?.joinedAt && <><button className="secondary-button" type="button" onClick={() => void run("session-decline", () => partnerService.sessionAction(activeSession.id, "decline"), "Study invitation declined.")}><FiX aria-hidden="true" />Decline</button><button className="primary-button" type="button" onClick={() => void run("session-join", () => partnerService.sessionAction(activeSession.id, "join"))}><FiCheck aria-hidden="true" />Join</button></>}{activeSession.status === "pending" && invitedBySelf && <button className="secondary-button" type="button" onClick={() => void run("session-cancel", () => partnerService.sessionAction(activeSession.id, "cancel"), "Study invitation cancelled.")}><FiX aria-hidden="true" />Cancel invitation</button>}{activeSession.status === "active" && selfMember?.joinedAt && !selfMember.leftAt && !selfMember.completedAt && <><button className="secondary-button" type="button" onClick={() => void run("session-pause", () => partnerService.sessionAction(activeSession.id, "pause"))}><FiPause aria-hidden="true" />Pause</button><button className="primary-button" type="button" onClick={() => void run("session-complete", () => partnerService.sessionAction(activeSession.id, "complete"), "Your study time was recorded.")}><FiCheck aria-hidden="true" />Complete</button></>}{activeSession.status === "paused" && selfMember?.joinedAt && !selfMember.leftAt && !selfMember.completedAt && <><button className="secondary-button" type="button" onClick={() => void run("session-resume", () => partnerService.sessionAction(activeSession.id, "resume"))}><FiPlay aria-hidden="true" />Resume</button><button className="primary-button" type="button" onClick={() => void run("session-complete", () => partnerService.sessionAction(activeSession.id, "complete"), "Your study time was recorded.")}><FiCheck aria-hidden="true" />Complete</button></>}{["active", "paused"].includes(activeSession.status) && selfMember?.joinedAt && !selfMember.leftAt && !selfMember.completedAt && <button className="secondary-button" type="button" onClick={() => void run("session-leave", () => partnerService.sessionAction(activeSession.id, "leave"), "You left the study session.")}><FiX aria-hidden="true" />Leave</button>}{["active", "paused"].includes(activeSession.status) && !selfMember?.completedAt && <button className="danger-button" type="button" onClick={() => void run("session-cancel", () => partnerService.sessionAction(activeSession.id, "cancel"), "Study session cancelled.")}><FiX aria-hidden="true" />Cancel session</button>}{selfMember?.completedAt && <span className="session-complete-note"><FiCheck aria-hidden="true" />Your time is recorded. Waiting for {partnerMember?.user.firstName || "partner"}.</span>}</div></div> : !showSessionForm && <p className="empty-state">Invite your partner to a server-timed focus session. Each participant's completed time is saved to their own study history.</p>}
                    </section>

                    <section className="partner-section" aria-labelledby="goals-heading">
                        <div className="section-header"><div><p className="eyebrow">Shared goals</p><h2 id="goals-heading">Productivity goals</h2></div><button className="secondary-button" type="button" onClick={() => { closeGoalForm(); setShowGoalForm(true); }}><FiPlus aria-hidden="true" />New goal</button></div>
                        {showGoalForm && <form className="partner-compact-form goal-form" onSubmit={createGoal}>
                            <label><span className="field-label">Goal title</span><input className="text-input" value={goalForm.title} onChange={(event) => setGoalForm((current) => ({ ...current, title: event.target.value }))} maxLength={160} required /></label>
                            <div className="goal-form-grid"><label><span className="field-label">Type</span><select className="select-input" value={goalForm.type} onChange={(event) => setGoalForm((current) => ({ ...current, type: event.target.value as SharedGoal["type"] }))}><option value="study_minutes">Study hours</option><option value="pomodoros">Pomodoros</option><option value="homework_completed">Homework completed</option><option value="custom">Custom productivity</option></select></label><label><span className="field-label">{goalForm.type === "study_minutes" ? "Target hours" : "Target"}</span><input className="text-input" type="number" min={goalForm.type === "study_minutes" ? 0.25 : 1} step={goalForm.type === "study_minutes" ? 0.25 : 1} max="1000000" value={goalForm.target} onChange={(event) => setGoalForm((current) => ({ ...current, target: Number(event.target.value) }))} required /></label></div>
                            {goalForm.type === "custom" && <label><span className="field-label">Current progress</span><input className="text-input" type="number" min="0" max="1000000" value={goalForm.manualProgress || 0} onChange={(event) => setGoalForm((current) => ({ ...current, manualProgress: Number(event.target.value) }))} /></label>}
                            <div className="goal-form-grid"><label><span className="field-label">Start date</span><input className="text-input" type="date" value={goalForm.startDate} onChange={(event) => setGoalForm((current) => ({ ...current, startDate: event.target.value }))} required /></label><label><span className="field-label">End date</span><input className="text-input" type="date" value={goalForm.endDate} onChange={(event) => setGoalForm((current) => ({ ...current, endDate: event.target.value }))} required /></label></div>
                            <div className="partner-actions"><button className="secondary-button" type="button" onClick={closeGoalForm}>Cancel</button><button className="primary-button" type="submit" disabled={busy === "goal"}>{editingGoalId ? <FiCheck aria-hidden="true" /> : <FiPlus aria-hidden="true" />}{editingGoalId ? "Save goal" : "Create goal"}</button></div>
                        </form>}
                        <div className="goal-list">{goals.map((goal) => <article className="goal-row" key={goal.id}>
                            <div className="goal-heading"><div><strong>{goal.title}</strong><span>{goalTypeLabel(goal.type)}</span></div><div className="goal-row-actions"><button className="icon-button" type="button" title="Edit goal" onClick={() => editGoal(goal)}><FiEdit2 aria-hidden="true" /></button><button className="icon-button" type="button" title="Remove goal" onClick={() => void run(`goal-delete-${goal.id}`, () => partnerService.deleteGoal(goal.id), "Shared goal removed.")}><FiTrash2 aria-hidden="true" /></button></div></div>
                            {goal.contributors.length > 0 && <div className="goal-contributors">{goal.contributors.map((contributor) => <div key={contributor.user.id}><span>{contributor.isSelf ? "You" : contributor.user.firstName}</span><strong>{contributor.value === null ? "Private" : goalValue(contributor.value, goal.type)}</strong></div>)}</div>}
                            <div className="progress-track"><span style={{ width: `${goal.percent}%` }} /></div><div className="goal-progress"><span>{goalValue(Math.max(0, goal.progress), goal.type)} / {goalValue(goal.target, goal.type)}</span><strong>{goal.percent}%</strong></div>
                        </article>)}{!goals.length && !showGoalForm && <p className="empty-state">No shared productivity goals yet.</p>}</div>
                    </section>
                </div>

                <aside className="partner-column">
                    <section className="partner-section"><div className="section-header"><div><p className="eyebrow">Encouragement</p><h2>Send support</h2></div><FiHeart className="section-icon" aria-hidden="true" /></div><div className="encouragement-grid">{encouragements.map((message) => <button className="small-button" type="button" key={message} disabled={busy === `encourage-${message}`} onClick={() => void run(`encourage-${message}`, () => partnerService.encourage(message), "Encouragement sent.")}><FiSend aria-hidden="true" />{message}</button>)}</div></section>

                    <section className="partner-section"><div className="section-header"><div><p className="eyebrow">Recent activity</p><h2>Shared feed</h2></div></div><div className="activity-list">{shared?.activity.map((activity) => <div className="activity-row" key={activity.id}><span className="activity-mark" aria-hidden="true"><FiCheck /></span><div><strong>{activity.actor.firstName} {activity.message.charAt(0).toLowerCase() + activity.message.slice(1)}</strong><time>{timeAgo(activity.createdAt)}</time></div></div>)}{!shared?.activity.length && <p className="empty-state">Shared activities will appear here only when the person has enabled the relevant sharing category.</p>}</div></section>

                    <section className="partner-section"><div className="section-header notification-heading"><div><p className="eyebrow">Notifications</p><h2>Updates {unread > 0 && <span className="notification-count">{unread}</span>}</h2></div><div className="partner-actions"><FiBell className="section-icon" aria-hidden="true" />{Boolean(state?.notifications.length) && <button className="small-button" type="button" disabled={busy === "notifications-clear"} onClick={() => void clearNotificationHistory()}><FiTrash2 aria-hidden="true" />Clear history</button>}</div></div><div className="notification-list">{state?.notifications.slice(0, 8).map((notification) => <button className={`notification-row ${notification.readAt ? "read" : ""}`} type="button" key={notification.id} onClick={() => !notification.readAt && void run(`notification-${notification.id}`, () => partnerService.readNotification(notification.id))}><strong>{notification.title}</strong>{notification.body && <span>{notification.body}</span>}<time>{timeAgo(notification.createdAt)}</time></button>)}{!state?.notifications.length && <p className="empty-state">No partner notifications.</p>}</div></section>
                </aside>
            </section>
        </>}
    </main>;
}
