"""The local voice switch: our server first, Cartesia only before any audio has come back."""
import os
os.environ.setdefault("CARTESIA_API_KEY", "x")
from app import voice


def cartesia_stub(text):
    yield b"CARTESIA"


def test_falls_back_when_the_server_is_unreachable():
    voice.TTS_PROVIDER, voice.LOCAL_TTS_URL, voice.TTS_FALLBACK = "local", "http://127.0.0.1:9", "cartesia"
    voice.cartesia_stream = cartesia_stub
    assert b"".join(voice.stream("hello")) == b"CARTESIA"


def test_no_fallback_raises_instead():
    voice.TTS_PROVIDER, voice.LOCAL_TTS_URL, voice.TTS_FALLBACK = "local", "http://127.0.0.1:9", "none"
    try:
        list(voice.stream("hello"))
    except RuntimeError as problem:
        assert "Siya server" in str(problem)
    else:
        raise AssertionError("expected a RuntimeError")


def test_missing_url_is_a_clear_message():
    voice.TTS_PROVIDER, voice.LOCAL_TTS_URL, voice.TTS_FALLBACK = "local", "", "none"
    try:
        list(voice.stream("hello"))
    except RuntimeError as problem:
        assert "LOCAL_TTS_URL" in str(problem)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok", name)
