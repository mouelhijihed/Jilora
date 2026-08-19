/* oxlint-disable react/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { partnerService } from "../services/partnerService";
import { useAuth } from "./useAuth";
import { subscribeRealtime } from "./useRealtime";
import { useSessions } from "./useSessions";

const MUSIC_FILE = "No Copyright Music \u{1F3B8} Lofi - Lofi Loop 1 Minute Looping.mp3";
const ALARM_FILE = "Digital alarm clock sound effect beeping sounds.mp3";
export const POMODORO_MUSIC_URL = `${import.meta.env.BASE_URL}audio/${encodeURIComponent(MUSIC_FILE)}`;
const ALARM_URL = `${import.meta.env.BASE_URL}audio/${encodeURIComponent(ALARM_FILE)}`;
const PLAYBACK_STORAGE_KEY = "jilora-pomodoro-music-playback";

type PlaybackSnapshot = { currentTime: number; playing: boolean; savedAt: number };
type SoundProblem = { kind: "music" | "alarm"; message: string; sessionId?: string };

function playbackSnapshot() {
    try {
        const value = JSON.parse(window.sessionStorage.getItem(PLAYBACK_STORAGE_KEY) || "null") as PlaybackSnapshot | null;
        return value && Number.isFinite(value.currentTime) && Number.isFinite(value.savedAt) ? value : null;
    } catch {
        return null;
    }
}

type PomodoroAudioContextValue = {
    musicMuted: boolean;
    setMusicMuted: Dispatch<SetStateAction<boolean>>;
    volume: number;
    setVolume: Dispatch<SetStateAction<number>>;
    soundBlocked: boolean;
    soundMessage: string;
    prepareMusic: () => Promise<boolean>;
    startMusic: () => Promise<boolean>;
    retrySound: () => Promise<boolean>;
    pauseMusic: () => void;
    stopMusic: () => void;
    completeAudio: (sessionId: string) => void;
};

const PomodoroAudioContext = createContext<PomodoroAudioContextValue | null>(null);

function reportAudioError(label: string, url: string, error: unknown) {
    if (import.meta.env.DEV) console.warn(`[Pomodoro audio] ${label} could not play (${url})`, error);
}

export function PomodoroAudioProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { activeSession, loading: sessionsLoading } = useSessions();
    const muteStorageKey = `jilora-pomodoro-music-muted:${user?.id || "anonymous"}`;
    const volumeStorageKey = `jilora-pomodoro-volume:${user?.id || "anonymous"}`;
    const [musicMuted, setMusicMuted] = useState(() => window.localStorage.getItem(muteStorageKey) === "true");
    const [volume, setVolume] = useState(() => {
        const value = Number(window.localStorage.getItem(volumeStorageKey));
        return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.35;
    });
    const [soundProblem, setSoundProblem] = useState<SoundProblem | null>(null);
    const musicRef = useRef<HTMLAudioElement | null>(null);
    const alarmRef = useRef<HTMLAudioElement | null>(null);
    const musicReady = useRef(false);
    const alarmReady = useRef(false);
    const alarmedSession = useRef<string | null>(null);
    const partnerSession = useRef<string | null>(null);
    const partnerAlarmTimer = useRef<number | null>(null);
    const personalSession = useRef<string | null>(null);
    const playbackState = useRef<"playing" | "paused" | "stopped">("stopped");
    const pageHiding = useRef(false);
    const [partnerChecked, setPartnerChecked] = useState(false);
    const alarmUnlocked = useRef(false);
    const pendingAlarmSession = useRef<string | null>(null);

    const persistPlayback = useCallback(() => {
        const music = musicRef.current;
        if (!music || playbackState.current === "stopped") {
            window.sessionStorage.removeItem(PLAYBACK_STORAGE_KEY);
            return;
        }
        window.sessionStorage.setItem(PLAYBACK_STORAGE_KEY, JSON.stringify({
            currentTime: Number.isFinite(music.currentTime) ? music.currentTime : 0,
            playing: playbackState.current === "playing",
            savedAt: Date.now(),
        } satisfies PlaybackSnapshot));
    }, []);

    const clearPartnerAlarm = useCallback(() => {
        if (partnerAlarmTimer.current !== null) window.clearTimeout(partnerAlarmTimer.current);
        partnerAlarmTimer.current = null;
    }, []);

    const stopMusic = useCallback(() => {
        clearPartnerAlarm();
        playbackState.current = "stopped";
        window.sessionStorage.removeItem(PLAYBACK_STORAGE_KEY);
        const music = musicRef.current;
        if (!music) return;
        music.pause();
        music.currentTime = 0;
    }, [clearPartnerAlarm]);

    const primeAlarm = useCallback(async () => {
        if (alarmUnlocked.current) return true;
        const alarm = alarmRef.current;
        if (!alarm) return false;
        const previousMuted = alarm.muted;
        alarm.muted = true;
        alarm.currentTime = 0;
        if (alarm.readyState === HTMLMediaElement.HAVE_NOTHING) alarm.load();
        try {
            await alarm.play();
            alarm.pause();
            alarm.currentTime = 0;
            alarm.muted = previousMuted;
            alarmUnlocked.current = true;
            return true;
        } catch (error) {
            alarm.muted = previousMuted;
            reportAudioError("completion alarm preparation", ALARM_URL, error);
            return false;
        }
    }, []);

    const startMusic = useCallback(async () => {
        playbackState.current = "playing";
        const music = musicRef.current;
        if (!music) {
            setSoundProblem({ kind: "music", message: "Pomodoro sound could not load." });
            return false;
        }
        if (music.readyState === HTMLMediaElement.HAVE_NOTHING) music.load();
        const alarmPreparation = primeAlarm();
        try {
            await music.play();
            void alarmPreparation;
            setSoundProblem((current) => current?.kind === "music" ? null : current);
            return true;
        } catch (error) {
            void alarmPreparation;
            setSoundProblem({ kind: "music", message: "Sound is blocked by your browser." });
            reportAudioError("background music", POMODORO_MUSIC_URL, error);
            return false;
        }
    }, [primeAlarm]);

    const prepareMusic = useCallback(async () => {
        const music = musicRef.current;
        if (!music) {
            setSoundProblem({ kind: "music", message: "Pomodoro sound could not load." });
            return false;
        }
        const muted = music.muted;
        music.muted = true;
        if (music.readyState === HTMLMediaElement.HAVE_NOTHING) music.load();
        const alarmPreparation = primeAlarm();
        try {
            await music.play();
            music.pause();
            music.currentTime = 0;
            music.muted = muted;
            void alarmPreparation;
            setSoundProblem((current) => current?.kind === "music" ? null : current);
            return true;
        } catch (error) {
            music.muted = muted;
            void alarmPreparation;
            setSoundProblem({ kind: "music", message: "Sound is blocked by your browser." });
            reportAudioError("background music preparation", POMODORO_MUSIC_URL, error);
            return false;
        }
    }, [primeAlarm]);

    const pauseMusic = useCallback(() => {
        playbackState.current = "paused";
        musicRef.current?.pause();
        persistPlayback();
    }, [persistPlayback]);

    const playAlarm = useCallback(async (sessionId: string, retry = false) => {
        if (alarmedSession.current === sessionId) return true;
        if (!retry && pendingAlarmSession.current === sessionId) return false;
        const alarm = alarmRef.current;
        if (!alarm) {
            setSoundProblem({ kind: "alarm", message: "Pomodoro sound could not load.", sessionId });
            return false;
        }
        pendingAlarmSession.current = sessionId;
        alarm.currentTime = 0;
        alarm.muted = false;
        if (alarm.readyState === HTMLMediaElement.HAVE_NOTHING) alarm.load();
        try {
            await alarm.play();
            alarmedSession.current = sessionId;
            pendingAlarmSession.current = null;
            setSoundProblem((current) => current?.kind === "alarm" ? null : current);
            return true;
        } catch (error) {
            setSoundProblem({ kind: "alarm", message: "Sound is blocked by your browser.", sessionId });
            reportAudioError("completion alarm", ALARM_URL, error);
            return false;
        }
    }, []);

    const completeAudio = useCallback((sessionId: string) => {
        stopMusic();
        void playAlarm(sessionId);
    }, [playAlarm, stopMusic]);

    const retrySound = useCallback(async () => {
        if (soundProblem?.kind === "alarm") {
            if (soundProblem.sessionId) return playAlarm(soundProblem.sessionId, true);
            const unlocked = await primeAlarm();
            if (unlocked) setSoundProblem(null);
            return unlocked;
        }
        return startMusic();
    }, [playAlarm, primeAlarm, soundProblem, startMusic]);

    useEffect(() => {
        const music = new Audio(POMODORO_MUSIC_URL);
        music.loop = true;
        music.preload = "auto";
        const alarm = new Audio(ALARM_URL);
        alarm.loop = false;
        alarm.preload = "auto";
        const reportMusicError = () => {
            musicReady.current = false;
            setSoundProblem({ kind: "music", message: "Pomodoro sound could not load." });
            if (import.meta.env.DEV) console.warn(`[Pomodoro audio] background music failed to load (${POMODORO_MUSIC_URL})`);
        };
        const reportAlarmError = () => {
            alarmReady.current = false;
            setSoundProblem({ kind: "alarm", message: "Pomodoro sound could not load." });
            if (import.meta.env.DEV) console.warn(`[Pomodoro audio] completion alarm failed to load (${ALARM_URL})`);
        };
        const markMusicReady = () => { musicReady.current = true; };
        const markAlarmReady = () => { alarmReady.current = true; };
        music.addEventListener("error", reportMusicError);
        music.addEventListener("canplay", markMusicReady);
        alarm.addEventListener("error", reportAlarmError);
        alarm.addEventListener("canplay", markAlarmReady);
        musicRef.current = music;
        alarmRef.current = alarm;
        const snapshot = playbackSnapshot();
        const restorePosition = () => {
            if (!snapshot) return;
            playbackState.current = snapshot.playing ? "playing" : "paused";
            const elapsed = snapshot.playing ? Math.max(0, (Date.now() - snapshot.savedAt) / 1000) : 0;
            const position = snapshot.currentTime + elapsed;
            music.currentTime = Number.isFinite(music.duration) && music.duration > 0 ? position % music.duration : position;
        };
        if (music.readyState >= 1) restorePosition();
        else music.addEventListener("loadedmetadata", restorePosition, { once: true });
        const preserveForRefresh = () => { pageHiding.current = true; persistPlayback(); };
        window.addEventListener("pagehide", preserveForRefresh);
        return () => {
            window.removeEventListener("pagehide", preserveForRefresh);
            if (!pageHiding.current) window.sessionStorage.removeItem(PLAYBACK_STORAGE_KEY);
            music.pause();
            music.removeEventListener("error", reportMusicError);
            music.removeEventListener("canplay", markMusicReady);
            music.src = "";
            alarm.pause();
            alarm.removeEventListener("error", reportAlarmError);
            alarm.removeEventListener("canplay", markAlarmReady);
            alarm.src = "";
            musicRef.current = null;
            alarmRef.current = null;
        };
    }, [persistPlayback]);

    useEffect(() => {
        const resumeAfterAutoplayBlock = () => {
            const music = musicRef.current;
            if (playbackState.current === "playing" && music?.paused) startMusic();
        };
        window.addEventListener("pointerdown", resumeAfterAutoplayBlock);
        window.addEventListener("keydown", resumeAfterAutoplayBlock);
        return () => {
            window.removeEventListener("pointerdown", resumeAfterAutoplayBlock);
            window.removeEventListener("keydown", resumeAfterAutoplayBlock);
        };
    }, [startMusic]);

    useEffect(() => {
        if (musicRef.current) {
            musicRef.current.muted = musicMuted;
            musicRef.current.volume = volume;
        }
        if (alarmRef.current) alarmRef.current.volume = volume;
        window.localStorage.setItem(muteStorageKey, String(musicMuted));
        window.localStorage.setItem(volumeStorageKey, String(volume));
    }, [musicMuted, muteStorageKey, volume, volumeStorageKey]);

    const syncPartnerSession = useCallback(async () => {
        try {
            const session = (await partnerService.state()).activeSession;
            const member = session?.members.find((item) => item.isSelf);
            clearPartnerAlarm();
            if (!session || !member?.joinedAt || member.leftAt) {
                if (partnerSession.current) stopMusic();
                partnerSession.current = null;
                return;
            }
            partnerSession.current = session.id;
            if (member.completedAt || session.status === "completed") stopMusic();
            else if (session.status === "active") {
                const remainingSeconds = Math.max(0, session.durationSeconds - session.elapsedSeconds);
                if (remainingSeconds === 0) completeAudio(session.id);
                else {
                    startMusic();
                    partnerAlarmTimer.current = window.setTimeout(() => completeAudio(session.id), remainingSeconds * 1000);
                }
            }
            else if (session.status === "paused") pauseMusic();
        } catch (error) {
            if (import.meta.env.DEV) console.warn("[Pomodoro audio] could not synchronize the shared study session", error);
        } finally {
            setPartnerChecked(true);
        }
    }, [clearPartnerAlarm, completeAudio, pauseMusic, startMusic, stopMusic]);

    useEffect(() => {
        void syncPartnerSession();
        return subscribeRealtime((change) => {
            if (["all", "partner", "sessions"].includes(change.scope)) void syncPartnerSession();
        });
    }, [syncPartnerSession]);

    useEffect(() => clearPartnerAlarm, [clearPartnerAlarm]);

    useEffect(() => {
        const session = activeSession?.activity === "study" ? activeSession : null;
        if (session?.status === "running") { personalSession.current = session.id; startMusic(); }
        else if (session?.status === "paused") { personalSession.current = session.id; pauseMusic(); }
        else if (personalSession.current) { personalSession.current = null; stopMusic(); }
    }, [activeSession, pauseMusic, startMusic, stopMusic]);

    useEffect(() => {
        if (!sessionsLoading && partnerChecked && !activeSession && !partnerSession.current) stopMusic();
    }, [activeSession, partnerChecked, sessionsLoading, stopMusic]);

    useEffect(() => {
        setMusicMuted(window.localStorage.getItem(muteStorageKey) === "true");
        const storedVolume = Number(window.localStorage.getItem(volumeStorageKey));
        setVolume(Number.isFinite(storedVolume) && storedVolume > 0 && storedVolume <= 1 ? storedVolume : 0.35);
        setSoundProblem(null);
    }, [muteStorageKey, volumeStorageKey]);

    const value = useMemo(() => ({
        musicMuted,
        setMusicMuted,
        volume,
        setVolume,
        soundBlocked: Boolean(soundProblem),
        soundMessage: soundProblem?.message || "",
        prepareMusic,
        startMusic,
        retrySound,
        pauseMusic,
        stopMusic,
        completeAudio,
    }), [completeAudio, musicMuted, pauseMusic, prepareMusic, retrySound, soundProblem, startMusic, stopMusic, volume]);
    return <PomodoroAudioContext.Provider value={value}>{children}</PomodoroAudioContext.Provider>;
}

export function usePomodoroAudio() {
    const value = useContext(PomodoroAudioContext);
    if (!value) throw new Error("usePomodoroAudio must be used inside PomodoroAudioProvider");
    return value;
}
