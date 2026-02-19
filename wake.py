#!/usr/bin/env python3
"""
Wake word sidecar for assistant.ts.
Streams microphone audio to openWakeWord and prints WAKE_DETECTED to stdout
when confidence exceeds the threshold.

Install deps: pip install openwakeword pyaudio numpy
Placeholder model: hey_jarvis (replace with custom model when trained)
"""
import sys
import numpy as np
import pyaudio
from openwakeword.model import Model

WAKE_MODEL = "hey_jarvis"  # placeholder — swap for custom "hey_sweetie" model
THRESHOLD = 0.5
CHUNK = 1280  # ~80ms at 16kHz
SAMPLE_RATE = 16000

pa = pyaudio.PyAudio()
stream = pa.open(
    rate=SAMPLE_RATE,
    channels=1,
    format=pyaudio.paInt16,
    input=True,
    frames_per_buffer=CHUNK,
)

model = Model(wakeword_models=[WAKE_MODEL], inference_framework="onnx")

print(f"[wake.py] Listening for wake word ({WAKE_MODEL})...", file=sys.stderr, flush=True)

try:
    while True:
        frame = stream.read(CHUNK, exception_on_overflow=False)
        audio = np.frombuffer(frame, dtype=np.int16)
        predictions = model.predict(audio)
        if predictions.get(WAKE_MODEL, 0) > THRESHOLD:
            print("WAKE_DETECTED", flush=True)
finally:
    stream.stop_stream()
    stream.close()
    pa.terminate()
