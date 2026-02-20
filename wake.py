#!/usr/bin/env python3
"""
Wake word sidecar for assistant.ts.
Prints WAKE_DETECTED to stdout whenever the selected model score crosses the threshold.
"""
import os
import sys
import types
import warnings

import numpy as np
import pyaudio

# Silence urllib SSL backend warnings from macOS system Python.
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

# Prevent openwakeword from importing heavy training deps at runtime.
verifier_stub = types.ModuleType("openwakeword.custom_verifier_model")
verifier_stub.train_custom_verifier = lambda *_args, **_kwargs: None
sys.modules.setdefault("openwakeword.custom_verifier_model", verifier_stub)

from openwakeword.model import Model

# -----------------------
# CONFIG: SET YOUR MODEL
# -----------------------
MODEL = "yo_bitch"

WAKE_MODEL_PATH = f"./wakewords/{MODEL}/{MODEL}.onnx"
WAKE_THRESHOLD = 0.5

# Feature models (required by openwakeword runtime)
FEATURE_MELSPEC_ONNX = "./wakewords/_shared/melspectrogram.onnx"
FEATURE_EMBED_ONNX = "./wakewords/_shared/embedding_model.onnx"
FEATURE_MELSPEC_TFLITE = "./wakewords/_shared/melspectrogram.tflite"
FEATURE_EMBED_TFLITE = "./wakewords/_shared/embedding_model.tflite"

CHUNK = 1280
SAMPLE_RATE = 16000


def _die(msg: str):
    print(f"[wake.py] {msg}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def _abs(path: str) -> str:
    return os.path.abspath(path)


def _resolve_framework(model_path: str) -> str:
    if model_path.endswith(".onnx"):
        return "onnx"
    if model_path.endswith(".tflite"):
        return "tflite"
    _die("WAKE_MODEL_PATH must end with .onnx or .tflite")
    return ""


def _feature_paths(framework: str):
    if framework == "onnx":
        return _abs(FEATURE_MELSPEC_ONNX), _abs(FEATURE_EMBED_ONNX)
    return _abs(FEATURE_MELSPEC_TFLITE), _abs(FEATURE_EMBED_TFLITE)


def main():
    wake_model_path = _abs(WAKE_MODEL_PATH)
    if not os.path.exists(wake_model_path):
        _die(f"Wake model not found: {wake_model_path}")

    framework = _resolve_framework(wake_model_path)
    melspec_path, embed_path = _feature_paths(framework)

    if not os.path.exists(melspec_path):
        _die(f"Missing feature model: {melspec_path}")
    if not os.path.exists(embed_path):
        _die(f"Missing feature model: {embed_path}")

    wake_name = os.path.splitext(os.path.basename(wake_model_path))[0]

    try:
        model = Model(
            wakeword_models=[wake_model_path],
            inference_framework=framework,
            melspec_model_path=melspec_path,
            embedding_model_path=embed_path,
        )
    except Exception as err:
        _die(f"Failed to init wake model: {err}")

    pa = pyaudio.PyAudio()
    try:
        stream = pa.open(
            rate=SAMPLE_RATE,
            channels=1,
            format=pyaudio.paInt16,
            input=True,
            frames_per_buffer=CHUNK,
        )
    except OSError as err:
        pa.terminate()
        _die(f"Microphone init failed: {err}")

    print(f"[wake.py] Listening for wake word ({wake_name}, {framework})...", file=sys.stderr, flush=True)

    try:
        while True:
            frame = stream.read(CHUNK, exception_on_overflow=False)
            audio = np.frombuffer(frame, dtype=np.int16)
            predictions = model.predict(audio)
            score = max((value for key, value in predictions.items() if wake_name in key), default=0.0)
            if score > WAKE_THRESHOLD:
                print("WAKE_DETECTED", flush=True)
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()


if __name__ == "__main__":
    main()
