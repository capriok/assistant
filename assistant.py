import subprocess
import time
import os

WHISPER = "./whisper.cpp/build/bin/whisper-cli"
MODEL = "./whisper.cpp/models/ggml-base.en.bin"

WAKE_WORD = "hey sweetie"
TEMP_FILE = "temp.wav"
FULL_FILE = "input.wav"

def record(seconds, filename):
    subprocess.run([
        "sox",
        "-d",
        "-r", "16000",
        "-c", "1",
        filename,
        "trim", "0", str(seconds)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def record_until_silence(filename):
    subprocess.run([
        "sox",
        "-d",
        "-r", "16000",
        "-c", "1",
        filename,
        "silence", "1", "0.1", "1%", "1", "1.0", "1%"
    ])

def transcribe(filename):
    result = subprocess.run(
        [WHISPER, "-f", filename, "-m", MODEL, "-nt", "-of", "txt"],
        capture_output=True,
        text=True
    )
    return result.stdout.strip().lower()

def listen_for_wake_word():
    print("👂 Listening for wake word...")
    while True:
        record(2, TEMP_FILE)
        text = transcribe(TEMP_FILE)
        if WAKE_WORD in text:
            print("🟢 Wake word detected!")
            return
        time.sleep(0.2)

def main():
    while True:
        listen_for_wake_word()

        print("🎙 Speak your command...")
        record_until_silence(FULL_FILE)

        print("🧠 Transcribing...")
        transcript = transcribe(FULL_FILE)

        if transcript:
            print("🗣 You said:", transcript)
        else:
            print("⚠️ Nothing detected.")

        print("--------------------------------")

if __name__ == "__main__":
    main()
