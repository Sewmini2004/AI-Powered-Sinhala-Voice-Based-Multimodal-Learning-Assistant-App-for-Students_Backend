import sys
import json
from transformers import pipeline
import soundfile as sf
import os
import torch

try:
    # Get the text to be converted from command-line arguments
    text_to_speak = sys.argv[1]

    # Use a well-trained Sinhala TTS model from Hugging Face
    model_name = "Ransaka/VoiceBox-SL-10M"
    
    # Check for GPU availability for faster processing
    device = "cuda:0" if torch.cuda.is_available() else "cpu"

    # Initialize the TTS pipeline with the model and device
    tts_pipe = pipeline("text-to-speech", model=model_name, device=device)

    # Generate the audio from the text
    audio = tts_pipe(text_to_speak)

    # Define the output file path in the same directory as the script
    output_path = os.path.join(os.path.dirname(__file__), 'temp_audio.wav')

    # Save the generated audio to a WAV file
    sf.write(output_path, audio["audio"], audio["sampling_rate"])
    
    # Print the success status and the file path as JSON
    print(json.dumps({"status": "success", "filePath": output_path}))

except Exception as e:
    # If an error occurs, print a detailed JSON error message
    print(json.dumps({
        "status": "error", 
        "message": "TTS failed.", 
        "details": str(e)
    }))
    sys.stderr.write(str(e))
    sys.exit(1)