"""Talking to the model.

Two brains, one switch: LLM_PROVIDER=groq (Qwen 3.6 27B) or gemini (2.5
Flash-Lite), both through the OpenAI-shaped chat API, with the same
parameters - reasoning off, JSON answers, tools, streaming, screenshots
attached as images. Groq's paid tier closed in August 2026 and its free tier
allows one document question a minute; Gemini measured the same time to
first word at a fifth of the price. Switching back is one line in .env.
Whisper stays on Groq either way.
"""

import base64
import json
import os
import re
import time

from groq import Groq, RateLimitError as GroqRateLimit
from openai import OpenAI, RateLimitError as OpenAIRateLimit

RateLimitError = (GroqRateLimit, OpenAIRateLimit)
from groq import APIConnectionError as GroqConnection
from openai import APIConnectionError as OpenAIConnection
APIConnectionError = (GroqConnection, OpenAIConnection)

PROVIDERS = {
    "groq": {
        "key": "GROQ_API_KEY",
        "model": "qwen/qwen3.6-27b",
        "base_url": None,   # the groq SDK knows its own
        # Qwen thinks out loud by default, and those tokens count against the
        # rate limit - measured 697 tokens vs 57 for the same tiny answer.
        "reasoning": "none",
    },
    "gemini": {
        "key": "GEMINI_API_KEY",
        # 2.5 Flash-Lite is closed to new accounts (404, Sep 2026). 3.5
        # Flash-Lite measured 0.76s to first word with thinking left at its
        # default; asking for "minimal" made it slower (1.5s) and "none" is
        # rejected. 3.5 Flash (not lite) thinks for 6s. Free tier trains on
        # inputs - screenshots included - so anything real runs on the paid tier.
        "model": "gemini-3.5-flash-lite",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "reasoning": None,   # leave the parameter out entirely
    },
    # The same Qwen, bought through OpenRouter and served from US GPU hosts.
    # Groq's paid tier closed in Aug 2026; DeepInfra measured 0.36s to first
    # word for this model, and there is no per-minute token wall.
    "openrouter": {
        "key": "OPENROUTER_API_KEY",
        "model": "qwen/qwen3.6-27b",
        "base_url": "https://openrouter.ai/api/v1",
        "reasoning": None,   # OpenRouter has its own dialect, below
        "extra_body": {
            "reasoning": {"effort": "none"},
            "provider": {
                # Measured from India, 4 Sep 2026: CoreWeave 0.74-0.93s to first
                # token every time; DeepInfra 0.7-0.84s with spikes to 2.4s; the
                # unlisted fallback (Chutes) 1.4-2.7s. Consistency wins.
                "order": ["coreweave", "deepinfra"],
                # No "only": 5 Sep 2026 DeepInfra returned engine_overloaded
                # for a whole session and there was nothing to fall to. A slow
                # third host (Chutes, 1.4-2.7s) beats silence; data_collection
                # below still keeps logging hosts out.
                "allow_fallbacks": True,
                "data_collection": "deny",            # never a host that logs or trains
                "require_parameters": True,           # tools, images, JSON must all work there
            },
        },
    },
}
PROVIDER = os.getenv("LLM_PROVIDER", "groq")
if PROVIDER not in PROVIDERS:
    raise RuntimeError(f"LLM_PROVIDER must be one of {sorted(PROVIDERS)}, not {PROVIDER!r}")

# Preview models get renamed with little notice, so keep it overridable.
MODEL = os.getenv("LLM_MODEL", PROVIDERS[PROVIDER]["model"])

# Speech in. Measured against whisper-large-v3-turbo on the same clips: same
# speed once warm, but turbo heard "Devanch" for "Devansh" and "Yaaar" for
# "Yaar", so the plain model wins on the only axis that differs.
STT_MODEL = os.getenv("STT_MODEL", "whisper-large-v3")

# qwen3.6 accepts 5 images per request (3 on qwen3.8).
MAX_IMAGES_PER_REQUEST = 5

_client = None   # the brain, whichever provider
_groq = None     # always Groq: Whisper lives there


PNG_MAGIC = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
JPEG_MAGIC = bytes([0xFF, 0xD8, 0xFF])


def image_type(data):
    """Label the bytes for what they are. Calling a JPEG a PNG makes the model
    see nothing at all - which is how a shared screen came back blank."""
    if data[:8] == PNG_MAGIC:
        return "image/png"
    if data[:3] == JPEG_MAGIC:
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def _key(provider):
    name = PROVIDERS[provider]["key"]
    key = os.getenv(name)
    if not key:
        raise RuntimeError(f"{name} is missing from backend/.env")
    return key


def groq_client():
    """Whisper, always on Groq - its audio limits are fine."""
    global _groq
    if _groq is None:
        # No silent retries. The library's default is to sleep out a
        # per-minute limit and try again without a word - which showed up
        # in the app as 6 to 13 seconds of unexplained "thinking" on screen
        # questions. If we must wait, we wait where it can be seen.
        _groq = Groq(api_key=_key("groq"), max_retries=0)
    return _groq


def client():
    """The brain."""
    global _client
    if _client is None:
        if PROVIDER == "groq":
            _client = groq_client()
        else:
            _client = OpenAI(
                api_key=_key(PROVIDER),
                base_url=PROVIDERS[PROVIDER]["base_url"],
                max_retries=0,
            )
    return _client


# How long the service says to wait, from its own message - Groq: "Please
# try again in 3.105s"; Gemini: "Please retry in 23.5s" / "retryDelay": "23s".
# The retry-after header was seen disagreeing with Groq's text by a factor
# of six, and a 20-second wait that still fails is the worst of both.
_TRY_AGAIN = re.compile(r"(?:try again in |retry in |retryDelay\W+)([0-9.]+)s")
MAX_WAIT_SECONDS = 10.0


def _wait_for(problem):
    said = _TRY_AGAIN.search(str(problem))
    if said:
        return float(said.group(1)) + 0.3   # what Groq asked for, uncapped

    headers = getattr(getattr(problem, "response", None), "headers", {}) or {}
    for name, scale in (("retry-after-ms", 0.001), ("retry-after", 1.0)):
        try:
            return min(MAX_WAIT_SECONDS, float(headers[name]) * scale)
        except (KeyError, ValueError, TypeError):
            continue
    return 3.0


def _call(make_request):
    """One API call. A per-minute limit is waited out - twice at most, out
    loud in the log; a spent daily allowance is raised at once, because a
    few seconds will not bring it back."""
    for attempt in range(3):
        try:
            return make_request()
        except APIConnectionError as problem:
            # A dropped connection mid-reply (seen 5 Sep, 30s into a long
            # call). Once more, straight away; the second drop is real.
            if attempt:
                raise
            print(f"[{PROVIDER}] connection dropped ({problem}): trying once more", flush=True)
            continue
        except RateLimitError as problem:
            text = str(problem)
            if "per day" in text or "TPD" in text or attempt == 2:
                raise
            wait = _wait_for(problem)
            if wait > MAX_WAIT_SECONDS:
                # Waiting a capped 10s of a 30s ask, then retrying into the
                # same wall, was 20 seconds of silence per document question.
                # Say how long straight away instead; the user decides.
                raise
            sizes = re.search(r"Limit (\d+), Used (\d+), Requested (\d+)", text)
            about = f" (limit {sizes[1]}, used {sizes[2]}, this request {sizes[3]})" if sizes else ""
            print(f"[{PROVIDER}] per-minute limit hit{about}: waiting {wait:.1f}s (try {attempt + 1} of 2)", flush=True)
            time.sleep(wait)


def _create(**request):
    # How much the model may think before answering, in each provider's
    # own dialect; None means the parameter is not sent at all.
    effort = PROVIDERS[PROVIDER]["reasoning"]
    if effort is not None:
        request["reasoning_effort"] = effort
    extra = PROVIDERS[PROVIDER].get("extra_body")
    if extra:
        request["extra_body"] = extra
    return _call(lambda: client().chat.completions.create(**request))


def transcribe(audio_bytes, filename="speech.wav"):
    """Speech to text. Returns "" when nothing was said.

    The language hint is load-bearing, not a nicety: without it Whisper
    transcribes Hinglish into Devanagari - "yaar, is PDF ka summary bata do"
    came back as Devanagari script, which is not what the user typed or
    expects to see. With language="en" it stays romanised.
    """
    answer = _call(lambda: groq_client().audio.transcriptions.create(
        file=(filename, audio_bytes),
        model=STT_MODEL,
        language="en",
        # Names it has never seen, spelt the way we spell them. Without
        # this "hey Qurie" came back as "Security".
        prompt="Qurie, Siya.",
        response_format="verbose_json",   # carries Whisper's own doubt, below
    ))
    text = (answer.text or "").strip()
    segments = [seg if isinstance(seg, dict) else seg.model_dump()
                for seg in (getattr(answer, "segments", None) or [])]
    doubt = not_speech(text, segments)
    if doubt:
        print(f"[transcribe] dropped {text[:40]!r}: {doubt}", flush=True)
        return ""
    return text


# Whisper invents words for noise rather than staying silent: a chair creak
# came back as "Thank you.", static as "Siya." (the prompt hint, echoed).
# Measured: noise scores no_speech_prob 0.23-0.25, a real sentence 0.07.
NO_SPEECH_ABOVE = 0.2
LOGPROB_BELOW = -1.0
# Her own names are NOT on this list: "Qurie" alone is the wake word. Static
# that echoes the prompt hint is caught by no_speech_prob instead.
HALLUCINATIONS = {"thank you", "thanks for watching", "thank you for watching", "you", "bye"}


SENTENCE_WORDS = 5   # this many words is speech whatever no_speech_prob says
# Short commands are exactly what a static-like reading hits: "Continue,
# continue." came back at 0.38 (6 Sep) and was thrown away mid-lesson. A known
# command stays unless Whisper is fairly sure there was no speech at all.
COMMANDISH = re.compile(
    r"^\W*(?:(?:yeah|yes|no|okay|ok|haan|nahi|please|just|so)\W*)*"
    r"(?:continue|stop|next|skip|repeat|wait|yes|no|haan|nahi|chalo|bas|ruko|again|go on|carry on|proceed"
    r"|start|pause|quiet|shut up)\b",
    re.IGNORECASE,
)
COMMAND_NO_SPEECH_ABOVE = 0.6


def not_speech(text, segments):
    """Why this transcript should be thrown away, or "" if it is real."""
    letters = re.sub(r"[^a-z]", "", text.lower())
    if not letters:
        return "no words"
    if segments:
        worst = max(seg.get("no_speech_prob", 0) for seg in segments)
        # 5 Sep 2026: "I am not a strong coder" (9 words) came back at 0.33 and
        # was thrown away. Static hallucinates a word or two, never a sentence.
        if worst > NO_SPEECH_ABOVE and len(text.split()) < SENTENCE_WORDS \
                and not (COMMANDISH.match(text) and worst <= COMMAND_NO_SPEECH_ABOVE):
            return f"no_speech_prob {worst:.2f}"
        weakest = min(seg.get("avg_logprob", 0) for seg in segments)
        if weakest < LOGPROB_BELOW:
            return f"avg_logprob {weakest:.2f}"
    if re.sub(r"[^a-z, ]", "", text.lower()).strip() in HALLUCINATIONS and len(letters) <= 12:
        return "known hallucination"
    return ""


def complete(prompt, system=None, images=None, json_object=False, temperature=None):
    """One question, one answer. `images` is a list of PNG/JPEG bytes.
    `temperature` 0 for a grader: the same answer must get the same verdict
    (measured 5 Sep: a thin answer was partial 5 of 5 in a row, then correct
    once inside a session - sampling, not judgement)."""
    content = [{"type": "text", "text": prompt}]

    for image in images or []:
        encoded = base64.b64encode(image).decode()
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{image_type(image)};base64,{encoded}"
            },
        })

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": content})

    response = _create(
        model=MODEL,
        messages=messages,
        response_format={"type": "json_object"} if json_object else None,
        **({"temperature": temperature} if temperature is not None else {}),
    )
    return _strip_reasoning(response.choices[0].message.content)


def _strip_reasoning(text):
    """Belt and braces - drop any <think> block that slips through, and the
    ```json fence Gemini likes to wrap a JSON answer in."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL).strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, flags=re.DOTALL)
    return fenced.group(1).strip() if fenced else text


TOOL_CALL_OPEN = "<tool_call>"


def parse_text_tool_calls(text):
    """Qwen sometimes writes a tool call as text instead of using the tools
    API. It looks like:

        <tool_call>
        <function=read_doc_section>
        <parameter=page_from>8</parameter>
        </function>
        </tool_call>
    """
    calls = []

    for index, block in enumerate(
        re.findall(r"<tool_call>(.*?)(?:</tool_call>|$)", text, flags=re.DOTALL)
    ):
        name = re.search(r"<function=([^>\s]+)>", block)
        if not name:
            continue

        arguments = {
            key.strip(): value.strip()
            for key, value in re.findall(
                r"<parameter=([^>]+)>(.*?)</parameter>", block, flags=re.DOTALL
            )
        }

        calls.append({
            "id": f"text_call_{index}",
            "name": name.group(1).strip(),
            "arguments": json.dumps(arguments),
        })

    return calls


def stream(messages, tools=None):
    """Yields ("text", delta) as the answer arrives, then ("tool_calls", [...])
    if the model asked for a tool instead of answering."""
    response = _create(
        model=MODEL,
        messages=messages,
        tools=tools or None,
        stream=True,
    )

    pending = {}

    # Until enough characters have arrived to tell a written-out tool call
    # from a real answer, hold the text back rather than showing the user
    # markup they should never see.
    mode = "text" if not tools else "deciding"
    held = ""
    written = ""

    # Closed on the way out, whichever way out. A consumer that stops early -
    # the look tool and the safety nets both return mid-stream on purpose -
    # used to leave the HTTP response for the garbage collector, which
    # closed it at a random moment. When that moment fell inside the
    # connection pool's own lock on another thread, the pool deadlocked and
    # every model call in the process hung forever; three threads were
    # found frozen on it, an ingest and a conversation among them.
    try:
        for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            if delta.content:
                written += delta.content

                if mode == "text":
                    yield "text", delta.content
                elif mode == "deciding":
                    held += delta.content
                    start = held.lstrip()

                    if start.startswith(TOOL_CALL_OPEN):
                        mode = "tool_text"
                    elif len(start) >= len(TOOL_CALL_OPEN) or not TOOL_CALL_OPEN.startswith(start):
                        mode = "text"
                        yield "text", held
                        held = ""

            for call in delta.tool_calls or []:
                # Arguments arrive a few characters at a time and have to be
                # stitched back together before they are valid JSON.
                # Gemini's compatibility layer sends a whole call in one
                # delta and may leave the index out.
                slot = pending.setdefault(
                    call.index if call.index is not None else len(pending),
                    {"id": "", "name": "", "arguments": ""},
                )
                if call.id:
                    slot["id"] = call.id
                if call.function.name:
                    slot["name"] = call.function.name
                if call.function.arguments:
                    slot["arguments"] += call.function.arguments
                # Gemini 3.x signs each call ("thought_signature") and refuses
                # the tool result unless the signature comes back with it.
                extra = getattr(call, "extra_content", None) or (call.model_extra or {}).get("extra_content")
                if extra:
                    slot["extra_content"] = extra

        if mode == "deciding" and held:
            yield "text", held

        if pending:
            yield "tool_calls", [pending[i] for i in sorted(pending)]
        elif mode == "tool_text":
            written_calls = parse_text_tool_calls(written)
            if written_calls:
                yield "tool_calls", written_calls
            else:
                # Looked like a tool call but was not parseable - better to show
                # it than to answer with silence.
                yield "text", written

    finally:
        response.close()