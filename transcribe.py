import sys
import json
from transformers import pipeline # type: ignore
import os

audio_file_path = sys.argv[1]
os.environ["PATH"] += os.pathsep + os.path.join(os.getcwd(), "ffmpeg", "bin")

try:
    pipe = pipeline(task="automatic-speech-recognition", model="Lingalingeswaran/whisper-small-sinhala_v3")
    transcribed_text = pipe(audio_file_path)["text"]
    print(json.dumps({"status": "success", "text": transcribed_text}))

except Exception as e:
    print(json.dumps({"status": "error", "message": str(e)}))
    sys.stderr.write(str(e))
    sys.exit(1)