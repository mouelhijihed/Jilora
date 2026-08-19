import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";

const MUSIC_FILE = "No Copyright Music \u{1F3B8} Lofi - Lofi Loop 1 Minute Looping.mp3";
const ALARM_FILE = "Digital alarm clock sound effect beeping sounds.mp3";
export const POMODORO_MUSIC_URL = `/audio/${encodeURIComponent(MUSIC_FILE)}`;
const ALARM_URL = `/audio/${encodeURIComponent(ALARM_FILE)}`;

function reportAudioError(label: string, url: string, error: unknown) {
    if (import.meta.env.DEV) console.warn(`[Pomodoro audio] ${label} could not play (${url})`, error);
}

export function usePomodoroAudio() {
    const { user } = useAuth();
    const [musicMuted, setMusicMuted] = useState(() => window.localStorage.getItem("jilora-pomodoro-music-muted") === "true");
    const [volume, setVolume] = useState(() => {
        const value = Number(window.localStorage.getItem("jilora-pomodoro-volume"));
        return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.35;
    });
    const musicRef = useRef<HTMLAudioElement | null>(null);
    const alarmRef = useRef<HTMLAudioElement | null>(null);
    const alarmedSession = useRef<string | null>(null);

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

    useEffect(() => { if (!user) stopMusic(); }, [stopMusic, user]);

    return { musicMuted, setMusicMuted, volume, setVolume, startMusic, pauseMusic, stopMusic, completeAudio };
}
