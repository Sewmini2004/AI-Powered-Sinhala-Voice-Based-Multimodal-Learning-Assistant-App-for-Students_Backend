import sys
import json
from PIL import Image # type: ignore
from transformers import TrOCRProcessor, VisionEncoderDecoderModel # type: ignore
import os 
import torch # type: ignore

try:
    # The image file path is passed as the first command-line argument
    image_file_path = sys.argv[1]

    # Use the Ransaka/TrOCR-Sinhala model
    model_name = "Ransaka/TrOCR-Sinhala"
    
    # Check for GPU availability
    device = "cuda:0" if torch.cuda.is_available() else "cpu"

    # Load the processor and model
    processor = TrOCRProcessor.from_pretrained(model_name)
    model = VisionEncoderDecoderModel.from_pretrained(model_name).to(device)
    
    # Open the local image file
    image = Image.open(image_file_path).convert("RGB")

    # Process the image and move it to the correct device (GPU or CPU)
    pixel_values = processor(images=image, return_tensors="pt").pixel_values.to(device)
    
    # Generate the text from the image
    generated_ids = model.generate(pixel_values)
    
    # Decode the generated text and clean it up
    scanned_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
    
    # Print the result as a JSON string to be read by the backend server
    print(json.dumps({"status": "success", "text": scanned_text}))

except Exception as e:
    # If any error occurs, print a detailed error message in JSON format
    print(json.dumps({
        "status": "error", 
        "message": "OCR failed.", 
        "details": str(e)
    }))
    sys.stderr.write(str(e))
    sys.exit(1)