/* oxlint-disable react/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { partnerService } from "../services/partnerService";
import { subscribeRealtime } from "./useRealtime";

const MUSIC_FILE = "No Copyright Music \u{1F3B8} Lofi - Lofi Loop 1 Minute Looping.mp3";
const ALARM_FILE = "Digital alarm clock sound effect beeping sounds.mp3";
export const POMODORO_MUSIC_URL = `/audio/${encodeURIComponent(MUSIC_FILE)}`;
const ALARM_URL = `/audio/${encodeURIComponent(ALARM_FILE)}`;

type PomodoroAudioContextValue = {
    musicMuted: boolean;
    setMusicMuted: Dispatch<SetStateAction<boolean>>;
    volume: number;
    setVolume: Dispatch<SetStateAction<number>>;
    prepareMusic: () => void;
    startMusic: () => void;
    pauseMusic: () => void;
    stopMusic: () => void;
    completeAudio: (sessionId: string) => void;
};

const PomodoroAudioContext = createContext<PomodoroAudioContextValue | null>(null);

function reportAudioError(label: string, url: string, error: unknown) {
    if (import.meta.env.DEV) console.warn(`[Pomodoro audio] ${label} could not play (${url})`, error);
}

export function PomodoroAudioProvider({ children }: { children: ReactNode }) {
    const [musicMuted, setMusicMuted] = useState(() => window.localStorage.getItem("jilora-pomodoro-music-muted") === "true");
    const [volume, setVolume] = useState(() => {
        const value = Number(window.localStorage.getItem("jilora-pomodoro-volume"));
        return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.35;
    });
    const musicRef = useRef<HTMLAudioElement | null>(null);
    const alarmRef = useRef<HTMLAudioElement | null>(null);
    const alarmedSession = useRef<string | null>(null);
    const partnerSession = useRef<string | null>(null);

    const stopMusic = useCallback(() => {
        const music = musicRef.current;
        if (!music) return;
        music.pause();
        music.currentTime = 0;
    }, []);

    const startMusic = useCallback(() => {
        const music = musicRef.current;
        if (!music) return;
        void music.play().catch((error) => reportAudioError("background music", POMODORO_MUSIC_URL, error));
    }, []);

    const prepareMusic = useCallback(() => {
        const music = musicRef.current;
        if (!music) return;
        const muted = music.muted;
        music.muted = true;
        void music.play().then(() => {
            music.pause();
            music.currentTime = 0;
            music.muted = muted;
        }).catch((error) => {
            music.muted = muted;
            reportAudioError("background music preparation", POMODORO_MUSIC_URL, error);
        });
    }, []);

    const pauseMusic = useCallback(() => { musicRef.current?.pause(); }, []);

    const completeAudio = useCallback((sessionId: string) => {
        stopMusic();
        if (alarmedSession.current === sessionId) return;
        alarmedSession.current = sessionId;
        const alarm = alarmRef.current;
        if (!alarm) return;
        alarm.currentTime = 0;
        void alarm.play().catch((error) => reportAudioError("completion alarm", ALARM_URL, error));
    }, [stopMusic]);

    useEffect(() => {
        const music = new Audio(POMODORO_MUSIC_URL);
        music.loop = true;
        const alarm = new Audio(ALARM_URL);
        alarm.loop = false;
        const reportMusicError = () => { if (import.meta.env.DEV) console.warn(`[Pomodoro audio] background music failed to load (${POMODORO_MUSIC_URL})`); };
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
        if (musicRef.current) {
            musicRef.current.muted = musicMuted;
            musicRef.current.volume = volume;
        }
        if (alarmRef.current) alarmRef.current.volume = volume;
        window.localStorage.setItem("jilora-pomodoro-music-muted", String(musicMuted));
        window.localStorage.setItem("jilora-pomodoro-volume", String(volume));
    }, [musicMuted, volume]);

    const syncPartnerSession = useCallback(async () => {
        try {
            const session = (await partnerService.state()).activeSession;
            const member = session?.members.find((item) => item.isSelf);
            if (!session || !member?.joinedAt || member.leftAt) {
                if (partnerSession.current) stopMusic();
                partnerSession.current = null;
                return;
            }
            partnerSession.current = session.id;
            if (member.completedAt || session.status === "completed") completeAudio(session.id);
            else if (session.status === "active") startMusic();
            else if (session.status === "paused") pauseMusic();
        } catch (error) {
            if (import.meta.env.DEV) console.warn("[Pomodoro audio] could not synchronize the shared study session", error);
        }
    }, [completeAudio, pauseMusic, startMusic, stopMusic]);

    useEffect(() => {
        void syncPartnerSession();
        return subscribeRealtime((change) => {
            if (["all", "partner", "sessions"].includes(change.scope)) void syncPartnerSession();
        });
    }, [syncPartnerSession]);

    const value = useMemo(() => ({ musicMuted, setMusicMuted, volume, setVolume, prepareMusic, startMusic, pauseMusic, stopMusic, completeAudio }), [completeAudio, musicMuted, pauseMusic, prepareMusic, startMusic, stopMusic, volume]);
    return <PomodoroAudioContext.Provider value={value}>{children}</PomodoroAudioContext.Provider>;
}

export function usePomodoroAudio() {
    const value = useContext(PomodoroAudioContext);
    if (!value) throw new Error("usePomodoroAudio must be used inside PomodoroAudioProvider");
    return value;
}
