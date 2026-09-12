"""Qurie's voice for the mobile app. Owner: Devansh.

POST /api/v1/voice   multipart: audio (file), history (json, optional), context (json, optional)
                     -> {transcript, language, answer, person_id, audio_b64, audio_mime}
POST /api/v1/ask     {text, history?, context?} -> {answer, person_id, audio_b64?, audio_mime}   (speak=true adds audio)

One request, one reply: Sarvam Saaras hears, the brain answers as Qurie, Sarvam Bulbul
speaks. No streaming and no barge-in; the phone plays the reply and listens again.
`context` is the notebook on the phone ({today, people[], txns[]}, the app's own types);
Qurie answers only from it and says so when it does not have the answer. Nothing is stored
here yet; when bills live in the database, ask.py queries them instead.
"""
import base64
import json
import os
import shutil
import struct
import subprocess
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from . import ask as brain, llm, voice as tts
from .auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["voice"])

SPEAKER = os.getenv("SARVAM_SPEAKER", "priya")
STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v3")
CODEC_BY_EXT = {"webm": "webm", "m4a": "x-m4a", "mp4": "mp4", "wav": "wav", "mp3": "mp3", "ogg": "ogg",
                "opus": "opus", "aac": "aac", "3gp": "mp4", "caf": "x-m4a", "flac": "flac"}
# The three modes, all of which Bulbul can speak.
VOICE_LANGS = ("en-IN", "hi-IN", "ta-IN")
# v1 speaks English only, whatever language was heard. Switch the others on with
# QURIE_VOICE_LANGS=en-IN,hi-IN,ta-IN once their strings are turned on in the app.
ENABLED_LANGS = tuple(x.strip() for x in os.getenv("QURIE_VOICE_LANGS", "en-IN").split(",")
                      if x.strip() in VOICE_LANGS) or ("en-IN",)
VOICE_LANG = os.getenv("TTS_LANGUAGE", "en-IN")
if VOICE_LANG not in ENABLED_LANGS:
    VOICE_LANG = ENABLED_LANGS[0]

def _sarvam_available() -> bool:
    return bool(os.getenv("SARVAM_API_KEY"))


_client = None


def _sarvam():
    """The Sarvam client, built once and kept. Saaras hears, Bulbul speaks."""
    global _client
    if _client is None:
        from sarvamai import SarvamAI
        key = os.getenv("SARVAM_API_KEY")
        if not key:
            raise HTTPException(500, "SARVAM_API_KEY is missing from backend/.env")
        _client = SarvamAI(api_subscription_key=key)
    return _client


# ---- Without a Sarvam key: hear through OpenRouter (Gemini takes audio), speak through the TTS switch in voice.py ----

HEAR_MODEL = os.getenv("HEAR_MODEL", "google/gemini-3.5-flash-lite")


def _to_wav(data: bytes, filename: str) -> bytes | None:
    """Browser clips are webm/opus, phones send m4a; the model is happiest with 16 kHz mono wav. Needs ffmpeg."""
    if not shutil.which("ffmpeg"):
        return None
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "webm").lower()
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, f"in.{ext}")
        dst = os.path.join(d, "out.wav")
        open(src, "wb").write(data)
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "16000", dst], capture_output=True)
        if r.returncode != 0 or not os.path.exists(dst):
            return None
        return open(dst, "rb").read()


def hear_openrouter(data: bytes, filename: str) -> tuple[str, str]:
    """Gemini via OpenRouter listens to the clip and returns the transcript plus a language code."""
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise HTTPException(500, "Neither SARVAM_API_KEY nor OPENROUTER_API_KEY is set in .env")
    wav = _to_wav(data, filename)
    b64 = base64.b64encode(wav or data).decode()
    fmt = "wav" if wav else ((filename.rsplit(".", 1)[-1] if "." in filename else "webm").lower())
    from openai import OpenAI
    client = OpenAI(api_key=key, base_url="https://openrouter.ai/api/v1")
    try:
        r = client.chat.completions.create(
            model=HEAR_MODEL, temperature=0, max_tokens=300,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Transcribe the speech exactly as spoken. Indian shop owner, Hindi, Hinglish or English. "
                                              "Hindi words spoken in Hindi go in Devanagari; English words stay English. "
                                              'Return ONLY JSON: {"transcript": string, "language_code": "hi-IN"|"en-IN"|"ta-IN"|"te-IN"|"kn-IN"|"mr-IN"|"gu-IN"}. '
                                              'If there is no speech, transcript is "".'},
                {"role": "user", "content": [{"type": "text", "text": "Transcribe this."},
                                             {"type": "input_audio", "input_audio": {"data": b64, "format": fmt}}]},
            ],
        )
    except Exception as e:
        raise HTTPException(502, f"Could not hear that. {str(e)[:160]}")
    raw = (r.choices[0].message.content or "").strip().strip("`")
    if raw.startswith("json"):
        raw = raw[4:]
    try:
        obj = json.loads(raw)
        return (obj.get("transcript") or "").strip(), obj.get("language_code") or "hi-IN"
    except ValueError:
        return raw, "hi-IN"


def _wav_from_pcm(pcm: bytes, rate: int) -> bytes:
    """Wrap raw 16-bit mono PCM in a WAV header so any player can open it."""
    header = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", 36 + len(pcm), b"WAVE", b"fmt ", 16, 1, 1, rate, rate * 2, 2, 16, b"data", len(pcm))
    return header + pcm


def speak_fallback(text: str) -> tuple[str, str]:
    """voice.py's TTS switch yields PCM; return it as base64 wav plus its mime.
    TTS_PROVIDER=device sends no audio at all: the phone reads the answer with its own Hindi voice."""
    if os.getenv("TTS_PROVIDER", "cartesia") == "device":
        return "", "audio/wav"
    try:
        pcm = b"".join(tts.stream(text[:600]))
    except Exception as e:
        raise HTTPException(502, f"Could not speak. {str(e)[:160]}")
    if not pcm:
        return "", "audio/wav"
    return base64.b64encode(_wav_from_pcm(pcm, tts.PCM_RATE)).decode(), "audio/wav"


def hear(data: bytes, filename: str) -> tuple[str, str]:
    """Saaras transcript and detected language code, e.g. ('शर्मा को कितना देना है', 'hi-IN')."""
    if not _sarvam_available():
        return hear_openrouter(data, filename)
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "wav").lower()
    codec = CODEC_BY_EXT.get(ext, "wav")
    try:
        r = _sarvam().speech_to_text.transcribe(file=(filename, data), model=STT_MODEL, mode="transcribe",
                                                language_code="unknown", input_audio_codec=codec)
    except Exception as e:
        raise HTTPException(502, f"Could not hear that. {str(e)[:160]}")
    return (r.transcript or "").strip(), (getattr(r, "language_code", None) or "hi-IN")


def speak(text: str, language: str) -> str:
    """Bulbul mp3 as base64. Without a Sarvam key, the TTS switch in voice.py as wav (see speak_with_mime)."""
    return speak_with_mime(text, language)[0]


def speak_with_mime(text: str, language: str) -> tuple[str, str]:
    if not _sarvam_available():
        return speak_fallback(text)
    # Speak the language asked for only if that mode is switched on. In v1 that
    # is English alone, so a Hindi question still gets an English answer spoken.
    spoken = language if language in ENABLED_LANGS else VOICE_LANG
    try:
        r = _sarvam().text_to_speech.convert(text=text, language_code=spoken, speaker=SPEAKER,
                                             model="bulbul:v3", output_audio_codec="mp3", speech_sample_rate=22050)
    except Exception as e:
        raise HTTPException(502, f"Could not speak. {str(e)[:160]}")
    return (r.audios[0] if r.audios else ""), "audio/mpeg"


def parse_json(raw: str | None, want: type):
    """A form field carrying JSON; anything malformed becomes the empty value."""
    try:
        v = json.loads(raw) if raw else None
    except ValueError:
        v = None
    return v if isinstance(v, want) else want()


@router.post("/voice")
async def voice(audio: UploadFile = File(...), history: str | None = Form(None), context: str | None = Form(None),
                user: dict = Depends(get_current_user)):
    data = await audio.read()
    if len(data) < 2000:
        return {"transcript": "", "language": None, "answer": "", "person_id": None, "audio_b64": None, "audio_mime": "audio/mpeg"}
    transcript, language = hear(data, audio.filename or "clip.wav")
    if not transcript:
        return {"transcript": "", "language": language, "answer": "", "person_id": None, "audio_b64": None, "audio_mime": "audio/mpeg"}
    out = brain.answer(transcript, user, parse_json(history, list))
    audio_b64, mime = speak_with_mime(out["answer"], language)
    return {"transcript": transcript, "language": language, **out, "audio_b64": audio_b64, "audio_mime": mime}


class AskIn(BaseModel):
    text: str
    history: list[dict] = []
    context: dict | None = None
    speak: bool = False
    language: str = "en-IN"


@router.post("/ask")
def ask(body: AskIn, user: dict = Depends(get_current_user)):
    """Answered from the database by ask.py, scoped to this shop. body.context is
    ignored: the phone no longer supplies the facts it is answered from."""
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Say something first.")
    out = brain.answer(text, user, body.history)
    audio_b64, mime = speak_with_mime(out["answer"], body.language) if body.speak else (None, "audio/mpeg")
    return {**out, "audio_b64": audio_b64, "audio_mime": mime}
