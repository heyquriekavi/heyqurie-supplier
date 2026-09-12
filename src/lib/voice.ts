/**
 * Voice mode: listen → think → speak → listen again, until closed.
 *
 * Listening records until the owner has spoken and then gone quiet for a moment
 * (silence detection on the mic level). The clip goes to POST /api/v1/voice, which
 * returns the transcript, Qurie's answer and her voice as mp3. While she speaks the
 * mic is off (no interruption); when the audio ends, listening starts again.
 *
 * Native uses expo-audio (metering on the recorder). Web uses MediaRecorder with an
 * AnalyserNode, because the browser recorder gives no level.
 */
import * as Speech from 'expo-speech';
import { AudioModule, createAudioPlayer, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAppState } from './appState';
import { ApiError, upload } from './http';
import type { Message } from './types';

export type Phase = 'starting' | 'listening' | 'thinking' | 'speaking' | 'error';

type Reply = { transcript: string; language: string | null; answer: string; audio_b64: string | null; audio_mime: string };

const SPEECH_DB = -32; // above this the owner is talking (expo-audio metering, dBFS)
const QUIET_DB = -42; // below this it is quiet
const QUIET_MS = 1100; // this long quiet after speech = done talking
const MAX_CLIP_MS = 20000; // never send more than this
const IDLE_RESTART_MS = 12000; // nothing said: restart the recorder so files stay small
const WEB_SPEECH = 0.06; // RMS 0..1 from the analyser
const WEB_QUIET = 0.025;

let seq = 1;
const mid = () => `v${Date.now().toString(36)}${seq++}`; // unique across hot reloads too

export function useVoiceMode(open: boolean) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const addMessages = useAppState((s) => s.addMessages);
  const messages = useAppState((s) => s.messages);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recState = useAudioRecorderState(recorder, 100);

  const alive = useRef(false);
  const phaseRef = useRef<Phase>('starting');
  const spoke = useRef(false);
  const lastLoud = useRef(0);
  const startedAt = useRef(0);
  const player = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const web = useRef<{ stream: MediaStream; rec: MediaRecorder; ctx: AudioContext; analyser: AnalyserNode; chunks: BlobPart[]; timer: number } | null>(null);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ---------- listening ----------
  const startListening = useCallback(async () => {
    if (!alive.current) return;
    spoke.current = false;
    lastLoud.current = 0;
    startedAt.current = Date.now();
    setLevel(0);
    try {
      if (Platform.OS === 'web') await startWeb();
      else {
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
      go('listening');
    } catch (e) {
      setError(String((e as Error)?.message || e));
      go('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startWeb() {
    // Browsers allow the mic only on https or localhost. Over plain http on a LAN address
    // navigator.mediaDevices does not exist at all.
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('insecure');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as DOMException)?.name;
      throw new Error(name === 'NotAllowedError' || name === 'SecurityError' ? 'mic' : name === 'NotFoundError' ? 'nomic' : String((e as Error)?.message || e));
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(250);
    const buf = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      if (phaseRef.current !== 'listening') return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      onLevel(rms, rms > WEB_SPEECH, rms < WEB_QUIET);
    }, 100);
    web.current = { stream, rec, ctx, analyser, chunks, timer };
  }

  function stopWeb(): Promise<Blob | null> {
    const w = web.current;
    web.current = null;
    if (!w) return Promise.resolve(null);
    window.clearInterval(w.timer);
    return new Promise((resolve) => {
      w.rec.onstop = () => {
        w.stream.getTracks().forEach((t) => t.stop());
        w.ctx.close().catch(() => {});
        resolve(new Blob(w.chunks, { type: 'audio/webm' }));
      };
      if (w.rec.state !== 'inactive') w.rec.stop();
      else w.rec.onstop?.(new Event('stop'));
    });
  }

  // Native: the recorder state carries the level.
  useEffect(() => {
    if (Platform.OS === 'web' || phaseRef.current !== 'listening') return;
    const db = recState.metering ?? -160;
    onLevel(Math.max(0, Math.min(1, (db + 60) / 60)), db > SPEECH_DB, db < QUIET_DB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recState.metering, recState.durationMillis]);

  function onLevel(display: number, loud: boolean, quiet: boolean) {
    if (phaseRef.current !== 'listening') return;
    setLevel(Platform.OS === 'web' ? Math.min(1, display * 6) : display);
    const now = Date.now();
    if (loud) {
      spoke.current = true;
      lastLoud.current = now;
    }
    const elapsed = now - startedAt.current;
    if (spoke.current && quiet && now - lastLoud.current > QUIET_MS) void finishClip();
    else if (spoke.current && elapsed > MAX_CLIP_MS) void finishClip();
    else if (!spoke.current && elapsed > IDLE_RESTART_MS) void restart();
  }

  async function restart() {
    go('starting');
    if (Platform.OS === 'web') await stopWeb();
    else await recorder.stop().catch(() => {});
    await startListening();
  }

  // ---------- thinking ----------
  async function finishClip() {
    go('thinking');
    setLevel(0);
    const form = new FormData();
    try {
      if (Platform.OS === 'web') {
        const blob = await stopWeb();
        if (!blob) return startListening();
        form.append('audio', blob, 'clip.webm');
      } else {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) return startListening();
        form.append('audio', { uri, name: 'clip.m4a', type: 'audio/m4a' } as unknown as Blob);
      }
      const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text ?? '' }));
      form.append('history', JSON.stringify(history));
      const r = await upload<Reply>('/api/v1/voice', form);
      if (!alive.current) return;
      if (!r.transcript) return startListening(); // silence or noise: keep listening
      setTranscript(r.transcript);
      setAnswer(r.answer);
      const at = new Date().toISOString();
      const said: Message[] = [
        { id: mid(), role: 'user', at, text: r.transcript },
        { id: mid(), role: 'qurie', at, text: r.answer },
      ];
      addMessages(said);
      if (r.audio_b64) await speak(r.audio_b64, r.audio_mime);
      else if (r.answer) await speakDevice(r.answer, r.language);
      else await startListening();
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 0 ? 'network' : err.message || 'error');
      go('error');
      setTimeout(() => alive.current && startListening(), 2500);
    }
  }

  // ---------- speaking ----------
  /** No audio from the server: the phone's own Hindi voice reads the answer. Free, offline, no key. */
  async function speakDevice(text: string, language: string | null) {
    go('speaking');
    setLevel(0.5);
    await new Promise<void>((resolve) => {
      try {
        Speech.speak(text, { language: language ?? 'hi-IN', rate: 0.95, onDone: () => resolve(), onError: () => resolve(), onStopped: () => resolve() });
      } catch {
        resolve();
      }
    });
    setLevel(0);
    if (alive.current) await startListening();
  }

  // The orb reacts to Qurie's voice: level comes from the playback samples.
  async function speak(b64: string, mime = 'audio/mpeg') {
    go('speaking');
    try {
      if (Platform.OS === 'web') await speakWeb(b64);
      else await speakNative(b64, mime);
    } catch {
      // playback failed: fall through and keep the loop alive
    }
    setLevel(0);
    if (alive.current) await startListening();
  }

  async function speakWeb(b64: string) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    const buf = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    }, 50);
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
      src.start();
    });
    window.clearInterval(timer);
    await ctx.close().catch(() => {});
  }

  async function speakNative(b64: string, mime = 'audio/mpeg') {
    const uri = `${FileSystem.cacheDirectory}qurie-reply.${mime.includes('wav') ? 'wav' : 'mp3'}`;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    const p = createAudioPlayer({ uri });
    player.current = p;
    try {
      p.setAudioSamplingEnabled(true);
    } catch {
      // not every platform samples; the orb then breathes on its own
    }
    const samples = p.addListener('audioSampleUpdate', (s) => {
      const frames = s.channels?.[0]?.frames;
      if (!frames?.length) return;
      let sum = 0;
      for (let i = 0; i < frames.length; i++) sum += frames[i] * frames[i];
      setLevel(Math.min(1, Math.sqrt(sum / frames.length) * 4));
    });
    await new Promise<void>((resolve) => {
      const sub = p.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) {
          sub.remove();
          resolve();
        }
      });
      p.play();
    });
    samples.remove();
    p.remove();
    player.current = null;
  }

  // ---------- open / close ----------
  useEffect(() => {
    if (!open) return;
    alive.current = true;
    (async () => {
      if (Platform.OS !== 'web') {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setError('mic');
          go('error');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
      await startListening();
    })();
    return () => {
      alive.current = false;
      if (Platform.OS === 'web') void stopWeb();
      else recorder.stop().catch(() => {});
      player.current?.remove();
      try {
        Speech.stop();
      } catch {
        // nothing was speaking
      }
      player.current = null;
      if (Platform.OS !== 'web') void setAudioModeAsync({ allowsRecording: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { phase, level, transcript, answer, error };
}
