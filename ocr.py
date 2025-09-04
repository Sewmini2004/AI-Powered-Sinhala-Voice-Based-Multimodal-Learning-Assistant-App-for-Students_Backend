import sys
import json
from transformers import pipeline # type: ignore
from PIL import Image # type: ignore
import os

try:
    image_file_path = sys.argv[1]

    # Use the specified Ransaka Sinhala OCR model
    ocr_pipe = pipeline("image-to-text", model="Ransaka/sinhala-ocr-model-v3")

    # The pipeline handles loading the image and running the model
    recognized_text = ocr_pipe(image_file_path)

    # The output is a list of dictionaries, we extract the text
    scanned_text = recognized_text[0]["generated_text"]

    # Return the result as a JSON string
    print(json.dumps({"status": "success", "text": scanned_text}))

except Exception as e:
    # Handle any errors and return them in a JSON format
    print(json.dumps({"status": "error", "message": str(e)}))
    sys.stderr.write(str(e))
    sys.exit(1)