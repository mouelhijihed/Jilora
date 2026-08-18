import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProductivity } from "../../hooks/useProductivity";
import { useSessions } from "../../hooks/useSessions";
import { useAuth } from "../../hooks/useAuth";
import type { ActivitySession, PomodoroSettings, SessionType } from "../../types/sessions";
import "./StudyPomodoro.css";

const modeLabels: Record<SessionType, string> = { focus: "Focus", shortBreak: "Short break", longBreak: "Long break", activity: "Activity" };
const MUSIC_URL = "/audio/No Copyright Music 🎸 Lofi - Lofi Loop 1 Minute Looping.mp3";
const ALARM_URL = "/audio/Digital alarm clock sound effect beeping sounds.mp3";

function reportAudioError(label: string, url: string, error: unknown) {
    if (import.meta.env.DEV) console.warn(`[Pomodoro audio] ${label} could not play (${url})`, error);
}

function elapsedSeconds(session: ActivitySession, now: number) {
    const currentSegment = session.status === "running" && session.activeStartedAt ? Math.max(0, Math.floor((now - new Date(session.activeStartedAt).getTime()) / 1000)) : 0;
    return Math.min(session.plannedDuration, session.actualDuration + currentSegment);
}

function formatTimer(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function durationForMode(settings: PomodoroSettings, mode: SessionType) {
    if (mode === "shortBreak") return settings.shortBreakDuration;
    if (mode === "longBreak") return settings.longBreakDuration;
    return settings.focusDuration;
}

export function StudyPomodoro() {
    const { user } = useAuth();
    const { subjects } = useProductivity();
    const { sessions, activeSession, pomodoroSettings, error: sessionsError, createSession, updateSession, cancelSession, updatePomodoroSettings } = useSessions();
    const studySession = activeSession?.activity === "study" ? activeSession : null;
    const completedFocusSessions = useMemo(() => sessions.filter((session) => session.activity === "study" && session.sessionType === "focus" && session.status === "completed"), [sessions]);
    const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
    const [topic, setTopic] = useState("");
    const [mode, setMode] = useState<SessionType>("focus");
    const [now, setNow] = useState(Date.now());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [settingsDraft, setSettingsDraft] = useState(() => ({ focus: pomodoroSettings.focusDuration / 60, short: pomodoroSettings.shortBreakDuration / 60, long: pomodoroSettings.longBreakDuration / 60 }));
    const [musicMuted, setMusicMuted] = useState(() => window.localStorage.getItem("jilora-pomodoro-music-muted") === "true");
    const [alarmEnabled, setAlarmEnabled] = useState(() => window.localStorage.getItem("jilora-pomodoro-alarm-enabled") !== "false");
    const [volume, setVolume] = useState(() => {
        const value = Number(window.localStorage.getItem("jilora-pomodoro-volume"));
        return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.35;
    });
    const musicRef = useRef<HTMLAudioElement | null>(null);
    const alarmRef = useRef<HTMLAudioElement | null>(null);
    const finalizingSession = useRef<string | null>(null);
    const alarmedSession = useRef<string | null>(null);

    function stopMusic() {
        const music = musicRef.current;
        if (!music) return;
        music.pause();
        music.currentTime = 0;
    }

    function playMusic() {
        const music = musicRef.current;
        if (!music) return;
        void music.play().catch((error) => reportAudioError("background music", MUSIC_URL, error));
    }

    const playCompletionAlarm = useCallback((sessionId: string) => {
        if (!alarmEnabled || alarmedSession.current === sessionId) return;
        alarmedSession.current = sessionId;
        const alarm = alarmRef.current;
        if (!alarm) return;
        alarm.currentTime = 0;
        void alarm.play().catch((error) => reportAudioError("completion alarm", ALARM_URL, error));
    }, [alarmEnabled]);

    useEffect(() => {
        const music = new Audio(MUSIC_URL);
        music.loop = true;
        const alarm = new Audio(ALARM_URL);
        alarm.loop = false;
        const reportMusicError = () => { if (import.meta.env.DEV) console.warn(`[Pomodoro audio] background music failed to load (${MUSIC_URL})`); };
        const reportAlarmError = () => { if (import.meta.env.DEV) console.warn(`[Pomodoro audio] completion alarm failed to load (${ALARM_URL})`); };
        music.addEventListener("error", reportMusicError);
        alarm.addEventListener("error", reportAlarmError);
        musicRef.current = music;
        alarmRef.current = alarm;
        return () => {
            music.pause();
            music.removeEventListener("error", reportMusicError);
            music.src = "";
            alarm.pause();
            alarm.removeEventListener("error", reportAlarmError);
            alarm.src = "";
            musicRef.current = null;
            alarmRef.current = null;
        };
    }, []);

    useEffect(() => {
        const music = musicRef.current;
        const alarm = alarmRef.current;
        if (music) {
            music.muted = musicMuted;
            music.volume = volume;
        }
        if (alarm) alarm.volume = volume;
        window.localStorage.setItem("jilora-pomodoro-music-muted", String(musicMuted));
        window.localStorage.setItem("jilora-pomodoro-alarm-enabled", String(alarmEnabled));
        window.localStorage.setItem("jilora-pomodoro-volume", String(volume));
    }, [alarmEnabled, musicMuted, volume]);

    useEffect(() => {
        if (!user) stopMusic();
    }, [user]);

    useEffect(() => {
        if (studySession?.status === "running") playMusic();
        else if (studySession?.status === "paused") musicRef.current?.pause();
        else stopMusic();
    }, [studySession?.id, studySession?.status]);

    useEffect(() => {
        if (!subjectId && subjects.length) setSubjectId(subjects[0].id);
    }, [subjectId, subjects]);

    useEffect(() => {
        setSettingsDraft({ focus: pomodoroSettings.focusDuration / 60, short: pomodoroSettings.shortBreakDuration / 60, long: pomodoroSettings.longBreakDuration / 60 });
    }, [pomodoroSettings]);

    useEffect(() => {
        if (!studySession) return;
        setSubjectId(studySession.subjectId);
        setTopic(studySession.topic);
        setMode(studySession.sessionType);
    }, [studySession]);

    useEffect(() => {
        if (studySession?.status !== "running") return;
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), 250);
        return () => window.clearInterval(interval);
    }, [studySession?.id, studySession?.status]);

    const plannedDuration = studySession?.plannedDuration ?? durationForMode(pomodoroSettings, mode);
    const elapsed = studySession ? elapsedSeconds(studySession, now) : 0;
    const remaining = Math.max(0, plannedDuration - elapsed);
    const progress = plannedDuration ? Math.min(100, Math.round((elapsed / plannedDuration) * 100)) : 0;

    useEffect(() => {
        if (!studySession || studySession.status !== "running" || remaining > 0 || finalizingSession.current === studySession.id) return;
        finalizingSession.current = studySession.id;
        stopMusic();
        playCompletionAlarm(studySession.id);
        const completedMode = studySession.sessionType;
        void updateSession(studySession.id, { status: "completed", actualDuration: studySession.plannedDuration, activeStartedAt: null, completedAt: new Date().toISOString() }).then(() => {
            const completedNumber = completedMode === "focus" ? completedFocusSessions.length + 1 : completedFocusSessions.length;
            setMode(completedMode === "focus" ? (completedNumber % 4 === 0 ? "longBreak" : "shortBreak") : "focus");
        }).catch((requestError) => {
            finalizingSession.current = null;
            setError(requestError instanceof Error ? requestError.message : "Could not complete Pomodoro");
        });
    }, [completedFocusSessions.length, remaining, studySession, updateSession, playCompletionAlarm]);

    async function start() {
        if (activeSession && !studySession) { setError("Another activity session is already active"); return; }
        if (studySession?.status === "paused") {
            setSaving(true); setError("");
            try { playMusic(); await updateSession(studySession.id, { status: "running", activeStartedAt: new Date().toISOString(), actualDuration: studySession.actualDuration }); setNow(Date.now()); }
            catch (requestError) { musicRef.current?.pause(); setError(requestError instanceof Error ? requestError.message : "Could not resume Pomodoro"); }
            finally { setSaving(false); }
            return;
        }
        if (studySession) return;
        const subject = subjects.find((item) => item.id === subjectId);
        if (mode === "focus" && !subject) { setError("Select a study subject"); return; }
        if (mode === "focus" && !topic.trim()) { setError("Add a study topic"); return; }
        const startedAt = new Date().toISOString();
        setSaving(true); setError(""); finalizingSession.current = null;
        try {
            playMusic();
            await createSession({ activity: "study", subjectId: mode === "focus" ? subject?.id : "", subject: mode === "focus" ? subject?.name : "", topic: mode === "focus" ? topic.trim() : modeLabels[mode], plannedDuration: durationForMode(pomodoroSettings, mode), actualDuration: 0, status: "running", sessionType: mode, pomodoroNumber: completedFocusSessions.length + (mode === "focus" ? 1 : 0), startedAt, activeStartedAt: startedAt });
            setNow(Date.now());
        } catch (requestError) { stopMusic(); setError(requestError instanceof Error ? requestError.message : "Could not start Pomodoro"); }
        finally { setSaving(false); }
    }

    async function pause() {
        if (!studySession || studySession.status !== "running") return;
        setSaving(true); setError("");
        try { await updateSession(studySession.id, { status: "paused", actualDuration: elapsedSeconds(studySession, Date.now()), activeStartedAt: null }); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not pause Pomodoro"); }
        finally { setSaving(false); }
    }

    async function stop() {
        stopMusic();
        if (!studySession) { setMode("focus"); return; }
        setSaving(true); setError("");
        try {
            await cancelSession(studySession.id);
            finalizingSession.current = null;
            setMode("focus");
        } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not stop Pomodoro"); }
        finally { setSaving(false); }
    }

    async function saveSettings() {
        const settings = { focusDuration: Math.round(settingsDraft.focus * 60), shortBreakDuration: Math.round(settingsDraft.short * 60), longBreakDuration: Math.round(settingsDraft.long * 60) };
        setSaving(true); setError("");
        try { await updatePomodoroSettings(settings); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save Pomodoro settings"); }
        finally { setSaving(false); }
    }

    const completedToday = completedFocusSessions.filter((session) => new Date(session.completedAt || session.startedAt).toDateString() === new Date().toDateString()).length;

    return <section className="pomodoro-panel" aria-label="Study Pomodoro">
        <div className="pomodoro-config">
            <div><p className="eyebrow">Study focus</p><h2>Pomodoro</h2></div>
            <div className="pomodoro-mode" role="group" aria-label="Pomodoro mode">{(["focus", "shortBreak", "longBreak"] as SessionType[]).map((item) => <button className={mode === item ? "active" : ""} type="button" disabled={Boolean(studySession)} onClick={() => setMode(item)} key={item}>{modeLabels[item]}</button>)}</div>
            <label><span className="field-label">Subject</span><select className="select-input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={Boolean(studySession) || mode !== "focus"}><option value="">Select subject</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>
            <label><span className="field-label">Topic</span><input className="text-input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Dynamic Programming" disabled={Boolean(studySession) || mode !== "focus"} /></label>
            <details className="pomodoro-settings"><summary>Timer and audio settings</summary><div className="pomodoro-settings-grid"><label><span>Focus minutes</span><input className="text-input" type="number" min="0.05" max="720" step="0.01" value={settingsDraft.focus} onChange={(event) => setSettingsDraft((current) => ({ ...current, focus: Number(event.target.value) }))} /></label><label><span>Short break</span><input className="text-input" type="number" min="0.05" max="720" step="0.01" value={settingsDraft.short} onChange={(event) => setSettingsDraft((current) => ({ ...current, short: Number(event.target.value) }))} /></label><label><span>Long break</span><input className="text-input" type="number" min="0.05" max="720" step="0.01" value={settingsDraft.long} onChange={(event) => setSettingsDraft((current) => ({ ...current, long: Number(event.target.value) }))} /></label><button className="small-button" type="button" disabled={saving || Boolean(studySession)} onClick={() => void saveSettings()}>Save</button><label className="audio-setting"><span>Music</span><button className="small-button" type="button" aria-pressed={!musicMuted} onClick={() => setMusicMuted((current) => !current)}>{musicMuted ? "Unmute" : "Mute"}</button></label><label className="audio-setting"><span>Alarm</span><button className="small-button" type="button" aria-pressed={alarmEnabled} onClick={() => setAlarmEnabled((current) => !current)}>{alarmEnabled ? "On" : "Off"}</button></label><label className="audio-setting volume-setting"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Pomodoro audio volume" /></label></div></details>
        </div>
        <div className="pomodoro-timer">
            <span className={`status-badge ${studySession?.status === "paused" ? "status-in-progress" : studySession?.status === "running" ? "status-completed" : "status-todo"}`}>{studySession?.status ?? modeLabels[mode]}</span>
            <strong className="pomodoro-clock">{formatTimer(remaining)}</strong>
            <div className="pomodoro-progress" aria-label={`${progress}% elapsed`}><span style={{ width: `${progress}%` }} /></div>
            <div className="pomodoro-cycle"><span>Pomodoro #{completedFocusSessions.length + 1}</span><span>{completedToday} completed today</span></div>
            <div className="pomodoro-controls"><button className="primary-button" type="button" onClick={() => void start()} disabled={saving || studySession?.status === "running"}>{studySession?.status === "paused" ? "Resume" : "Start"}</button><button className="secondary-button" type="button" onClick={() => void pause()} disabled={saving || studySession?.status !== "running"}>Pause</button><button className="danger-button" type="button" onClick={() => void stop()} disabled={saving || !studySession}>Stop</button></div>
            {(error || sessionsError) && <p className="form-error">{error || sessionsError}</p>}
        </div>
    </section>;
}
