"""The avatar's voice: Cartesia Sonic.

One file, like llm.py - switching to another provider changes nothing
upstream. Speech in the other direction is done by the browser, so nothing
here listens.
"""

import os
import re
import time

import httpx
import threading

ENDPOINT = "https://api.cartesia.ai/tts/bytes"
API_VERSION = "2026-08-14"

MODEL = os.getenv("TTS_MODEL", "sonic-3.6")

# Siya: Hindi, feminine, switches into English mid-sentence without sounding
# broken. Any id from the Cartesia voice library works here.
VOICE = os.getenv("TTS_VOICE", "4459a9a5-69d6-4680-b970-e13dc51845b6")
LANGUAGE = os.getenv("TTS_LANGUAGE", "en")

# Cartesia's own rule for Hinglish (Sonic 3.6 guide, Sep 2026): a sentence with
# romanised Hindi in it goes out as language "hi" with normalization "en-IN",
# and the model switches to the English words itself; sent as "en" the Hindi
# is read as English and mangled - what Devansh heard. Pure English stays "en".
HINGLISH = re.compile(
    r"\b(?:hai|hain|ka|ki|ke|ko|se|aur|yeh|ye|woh|wo|matlab|samjho|samjha|samajh|dekho|jab|toh|hota|hoti|hote"
    r"|karte|karta|karti|karo|kaise|kyun|kyunki|bhi|nahi|nahin|bahut|iska|uska|isse|jaise|lekin|phir|abhi|yahan|theek|accha|achha|chalo|batao|bolo|kya|kuch|mein|par|ab|agla|agli|sawaal|jawab|samjhe|bataiye|dobara|haan|kar|karein|kijiye|sochiye|dhyan|baat|wala|wale|mera|meri|tera|aapka|aap|tum|hum|thoda|zyada|pehle|baad|saath|bilkul|sahi|galat|yaad|shuru|khatam|dekhte|dekhiye|sunte|suno)\b",
    re.IGNORECASE,
)


def language_for(text):
    """{"language": ..., "normalization": ...} for one sentence."""
    if LANGUAGE == "en" and len(HINGLISH.findall(text)) >= 2:
        return {"language": "hi", "normalization": "en-IN"}
    return {"language": LANGUAGE}


# Which voice. Cartesia is Siya; Sarvam (Bulbul v3, servers in Mumbai) is on
# trial for the round trip it saves from India. Same raw PCM out either way.
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "cartesia")
SARVAM_SPEAKER = os.getenv("SARVAM_SPEAKER", "priya")   # bulbul:v3 voice; anushka is v2-only
SARVAM_LANGUAGE = os.getenv("SARVAM_LANGUAGE", "hi-IN")   # hi-IN reads code-mixed text; en-IN is English-only


# Our own model (E:/siya_voice/server.py on a rented GPU): same PCM out. While
# it is new, a sentence it cannot speak goes to Cartesia so the lesson never
# goes silent; TTS_FALLBACK=none to hear every failure instead.
LOCAL_TTS_URL = os.getenv("LOCAL_TTS_URL", "").rstrip("/")
LOCAL_TTS_TOKEN = os.getenv("LOCAL_TTS_TOKEN", "")
TTS_FALLBACK = os.getenv("TTS_FALLBACK", "cartesia")


def configured():
    if TTS_PROVIDER == "sarvam":
        return bool(os.getenv("SARVAM_API_KEY"))
    if TTS_PROVIDER == "local":
        return bool(LOCAL_TTS_URL) or (TTS_FALLBACK == "cartesia" and bool(os.getenv("CARTESIA_API_KEY")))
    return bool(os.getenv("CARTESIA_API_KEY"))


# Connections to this host used to reset about two dials in three. The cause
# turned out to be the route, not the host: api.cartesia.ai resolves to an
# IPv6 address first, and that path is broken from this network. Measured
# on 8 fresh connections each way - IPv4 8/8, IPv6 1/8, default 4/8. The
# client below is pinned to IPv4. The retries stay as a belt for the odd
# genuine blip, but they should almost never be needed now.
ATTEMPTS = 8
BACKOFF_SECONDS = 0.4

# Concurrency, not connectivity: the plan allows 2 requests at once.
BUSY_ATTEMPTS = 6
BUSY_WAIT_SECONDS = 0.35

# One client per worker thread, never shared. A single client shared across
# threads deadlocked: a stream being closed on one thread (the user cut her
# off) waited on the pool lock while another thread's dial waited inside it -
# both her synthesis slots were held forever and every later reply was
# written but never spoken. Threads are reused, so connections still are.
_local = threading.local()


def session():
    client = getattr(_local, "client", None)
    if client is None:
        client = _local.client = httpx.Client(
            # Audio chunks arrive every ~100ms once they start. A stream that
            # goes quiet for longer has stalled - seen: all the audio in 1s,
            # then nothing for 20s - and every second spent waiting on it is
            # a second she stays muted with nothing to say.
            timeout=httpx.Timeout(30, connect=10, read=6),
            # Binding the local end to an IPv4 address is how httpx is told
            # "IPv4 only" - the socket family follows the local address.
            transport=httpx.HTTPTransport(
                local_address="0.0.0.0",
                http2=False,
                limits=httpx.Limits(
                    max_keepalive_connections=2,
                    keepalive_expiry=120,
                ),
            ),
        )
    return client


# What the streaming route sends: raw 16-bit mono samples, no container. The
# renderer schedules them straight onto the audio clock as they arrive.
# Measured: the first bytes come back ~170ms after the request, the whole
# file ~800ms. Waiting for the file was 600ms of silence per sentence.
PCM_RATE = 24000
PCM_FORMAT = {"container": "raw", "encoding": "pcm_s16le", "sample_rate": PCM_RATE}


def _dial(text, key):
    """Opens the stream, retrying only the dial. Returns (context, response).

    The resets happen when connecting, so that is the only part worth trying
    again. Retrying around the whole stream - the first version of this -
    restarted the sentence from the top on a mid-stream hiccup and, with the
    backoff ladder, turned 2.5 seconds of audio into 15.
    """
    last = None
    for attempt in range(ATTEMPTS):
        opened = session().stream(
            "POST",
            ENDPOINT,
            headers={
                "Cartesia-Version": API_VERSION,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model_id": MODEL,
                "transcript": text,
                "voice": VOICE,
                **language_for(text),
                "output_format": PCM_FORMAT,
            },
        )
        try:
            return opened, opened.__enter__()
        except httpx.HTTPError as problem:
            last = problem
            session().close()
            _local.client = None
            if attempt < ATTEMPTS - 1:
                time.sleep(BACKOFF_SECONDS * (attempt + 1))

    raise RuntimeError(f"Could not reach Cartesia after {ATTEMPTS} tries: {last}")


def stream(text):
    """Yields raw PCM chunks as the voice produces them."""
    if TTS_PROVIDER == "sarvam":
        yield from sarvam_stream(text)
        return
    if TTS_PROVIDER == "local":
        yield from local_stream(text)
        return
    yield from cartesia_stream(text)


def local_stream(text):
    """Our own Siya model. Falls back to Cartesia only before any audio has
    come back, so a sentence is never restarted in another voice mid-way."""
    try:
        if not LOCAL_TTS_URL:
            raise RuntimeError("LOCAL_TTS_URL is missing from backend/.env")
        response = session().send(session().build_request(
            "POST", f"{LOCAL_TTS_URL}/tts", json={"text": text},
            headers={"Authorization": f"Bearer {LOCAL_TTS_TOKEN}"},
            # the whole sentence is generated before the first byte: ~0.5s per second of speech
            timeout=httpx.Timeout(60, connect=10, read=30)), stream=True)
        if response.status_code >= 400:
            response.close()
            raise RuntimeError(f"Siya server said {response.status_code}: {response.read()[:120]!r}")
        chunks = response.iter_bytes()
        first = next(chunks, b"")
        if not first:
            response.close()
            raise RuntimeError("Siya server returned no audio")
    except (httpx.HTTPError, RuntimeError) as problem:
        if TTS_FALLBACK != "cartesia":
            raise RuntimeError(f"Siya server: {problem}")
        print(f"[speak] Siya server: {problem} - falling back to Cartesia", flush=True)
        yield from cartesia_stream(text)
        return
    try:
        yield first
        for chunk in chunks:
            if chunk:
                yield chunk
    except httpx.HTTPError as problem:
        print(f"[speak] Siya stream ended early: {problem}", flush=True)
    finally:
        response.close()


def sarvam_stream(text):
    """Bulbul v3 over HTTP chunks: 16-bit mono PCM at PCM_RATE, same as Cartesia."""
    from sarvamai import SarvamAI   # imported here so Cartesia-only installs need not have it
    key = os.getenv("SARVAM_API_KEY")
    if not key:
        raise RuntimeError("SARVAM_API_KEY is missing from backend/.env")
    client = SarvamAI(api_subscription_key=key)
    try:
        for chunk in client.text_to_speech.convert_stream(
            text=text,
            model="bulbul:v3",
            speaker=SARVAM_SPEAKER,
            language_code=SARVAM_LANGUAGE,
            output_audio_codec="linear16",
            speech_sample_rate=PCM_RATE,
        ):
            if chunk:
                yield chunk
    except Exception as problem:
        raise RuntimeError(f"Sarvam said: {str(problem)[:200]}")


def cartesia_stream(text):
    """Yields raw PCM chunks as Cartesia produces them.

    Once bytes are flowing, a failure ends the sentence early rather than
    starting it again mid-word.
    """
    key = os.getenv("CARTESIA_API_KEY")
    if not key:
        raise RuntimeError("CARTESIA_API_KEY is missing from backend/.env")

    # A busy signal is not a failure. The renderer keeps itself to two
    # requests at a time, but the greeting, a check-in and a reply can still
    # meet at the door - so a full house is waited out for a moment, and the
    # sentence is only given up on after that.
    for attempt in range(BUSY_ATTEMPTS):
        opened, response = _dial(text, key)
        if response.status_code == 429 or (
            response.status_code >= 400 and b"concurren" in response.read().lower()
        ):
            opened.__exit__(None, None, None)
            wait = BUSY_WAIT_SECONDS * (attempt + 1)
            print(f"[speak] Cartesia is full: waiting {wait:.1f}s (try {attempt + 1} of {BUSY_ATTEMPTS})", flush=True)
            time.sleep(wait)
            continue
        break

    try:
        if response.status_code == 401:
            raise RuntimeError("Cartesia rejected the API key.")
        if response.status_code == 402:
            raise RuntimeError("Cartesia credits are used up for this month.")
        if response.status_code >= 400:
            raise RuntimeError(f"Cartesia said: {response.read()[:200]!r}")

        try:
            for chunk in response.iter_bytes():
                if chunk:
                    yield chunk
        except httpx.HTTPError as problem:
            print(f"[speak] stream ended early: {problem}", flush=True)
    finally:
        opened.__exit__(None, None, None)


def speak(text):
    """Returns MP3 bytes. Raises RuntimeError with something a person can act on."""
    key = os.getenv("CARTESIA_API_KEY")
    if not key:
        raise RuntimeError("CARTESIA_API_KEY is missing from backend/.env")

    last = None

    for attempt in range(ATTEMPTS):
        try:
            return _request(key, text)
        except httpx.HTTPError as problem:
            last = problem
            # A reset poisons the pooled connection - drop it and redial.
            global _session
            if _session is not None:
                _session.close()
                _session = None
            if attempt < ATTEMPTS - 1:
                time.sleep(BACKOFF_SECONDS * (attempt + 1))

    raise RuntimeError(f"Could not reach Cartesia after {ATTEMPTS} tries: {last}")


def _request(key, text):
    response = session().post(
        ENDPOINT,
        headers={
            "Cartesia-Version": API_VERSION,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json={
            "model_id": MODEL,
            "transcript": text,
            "voice": VOICE,
            **language_for(text),
            # mp3 so the browser can play it straight from an <audio> element.
            "output_format": {
                "container": "mp3",
                "encoding": "mp3",
                "sample_rate": 44100,
            },
        },
    )

    if response.status_code == 401:
        raise RuntimeError("Cartesia rejected the API key.")
    if response.status_code == 402:
        raise RuntimeError("Cartesia credits are used up for this month.")
    if response.status_code >= 400:
        raise RuntimeError(f"Cartesia said: {response.text[:200]}")

    return response.content
