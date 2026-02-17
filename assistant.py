import subprocess
import time
import re
import os

WHISPER = "./whisper.cpp/build/bin/whisper-cli"
MODEL = "./whisper.cpp/models/ggml-base.en.bin"

WAKE_TOKENS = ["hey", "sweetie"]

TEMP_FILE = "wake.wav"
COMMAND_FILE = "command.wav"


# --------------------------
# Helpers
# --------------------------

def normalize(text):
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    return text.strip()

def wake_detected(text):
    text = normalize(text)
    tokens = text.split()
    return all(token in tokens for token in WAKE_TOKENS)

def record_fixed(seconds, filename):
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
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def transcribe(filename):
    result = subprocess.run(
        [WHISPER, "-f", filename, "-m", MODEL, "-nt", "-of", "txt"],
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

def handle_text(text: str) -> None:
    text = normalize(text)

    if "time" in text:
        import datetime
        now = datetime.datetime.now().strftime("%H:%M")
        print(f"🕒 The time is {now}")
        return

    print("🤖 I heard:", text)


# --------------------------
# Wake Loop
# --------------------------

def listen_for_wake():
    print("👂 Listening for wake word...")

    while True:
        record_fixed(3, TEMP_FILE)

        text = transcribe(TEMP_FILE)
        if text:
            print("DEBUG:", text)

        if wake_detected(text):
            print("🟢 Wake word detected!")
            return

        time.sleep(0.2)


# --------------------------
# Main
# --------------------------

def main():
    while True:
        listen_for_wake()

        print("🎙 Speak your command...")
        record_until_silence(COMMAND_FILE)

        print("🧠 Transcribing command...")
        transcript = transcribe(COMMAND_FILE)

        if transcript:
            print("🗣 You said:", transcript)
            handle_text(transcript)

        else:
            print("⚠️ Nothing detected.")

        print("--------------------------------")


if __name__ == "__main__":
    main()
