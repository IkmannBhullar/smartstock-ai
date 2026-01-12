import os
import re
import requests
import speech_recognition as sr
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import InferenceClient
from pydub import AudioSegment
from dotenv import load_dotenv  # New import

# --- CONFIGURATION ---
load_dotenv()  # This loads the .env file
HF_TOKEN = os.getenv("HF_TOKEN") # Reads the token safely

if not HF_TOKEN:
    raise ValueError("HF_TOKEN not found! Make sure you created the .env file.")

# Initialize Client
client = InferenceClient(token=HF_TOKEN)
# Models
VISION_MODEL = "facebook/detr-resnet-50"
# Logic Model URL (New Router)
LOGIC_API_URL = "https://router.huggingface.co/hf-inference/models/google/flan-t5-large"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "online"}

@app.post("/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    try:
        temp_filename = "temp_image.jpg"
        with open(temp_filename, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Vision usually works fine via the library
        results = client.object_detection(image=temp_filename, model=VISION_MODEL)
        
        detected_items = []
        for item in results:
            if item.score > 0.5 and item.label != "person":
                detected_items.append({
                    "object": item.label,
                    "confidence": f"{round(item.score * 100, 1)}%"
                })
        
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
                
        return {"items": detected_items}
        
    except Exception as e:
        print(f"!!! BACKEND ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-voice")
async def process_voice(file: UploadFile = File(...)):
    try:
        # 1. Save temp files
        temp_input = "temp_input_audio" 
        temp_wav = "final_clean.wav"
        
        with open(temp_input, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
            
        # 2. Convert to WAV (Fixes "Audio file could not be read")
        try:
            audio = AudioSegment.from_file(temp_input)
            audio.export(temp_wav, format="wav")
        except Exception as e:
            raise Exception("FFmpeg conversion failed. Is ffmpeg installed?")

        # 3. Transcribe (Google Speech - Reliable)
        recognizer = sr.Recognizer()
        text_command = ""
        
        with sr.AudioFile(temp_wav) as source:
            audio_data = recognizer.record(source)
            try:
                text_command = recognizer.recognize_google(audio_data)
                print(f"DEBUG: Transcribed: {text_command}")
            except sr.UnknownValueError:
                text_command = "No speech detected"

        # 4. Logic Extraction (Hybrid: AI -> Fallback)
        logic_result = "Analyzing..."
        
        # Attempt A: Try AI Brain
        try:
            print("DEBUG: Sending to AI Logic Brain...")
            prompt = f"Extract action and item from: '{text_command}'"
            
            # Use direct URL to bypass 'StopIteration' library bug
            headers = {"Authorization": f"Bearer {HF_TOKEN}"}
            payload = {"inputs": prompt}
            response = requests.post(LOGIC_API_URL, headers=headers, json=payload)
            
            if response.status_code == 200:
                # API worked!
                logic_result = response.json()[0]['generated_text']
            else:
                raise Exception("AI Server Busy")
                
        except Exception as e:
            print(f"DEBUG: AI Brain busy ({e}), switching to Backup Brain.")
            # Attempt B: Backup Python Brain (Simple Rules)
            # If AI fails, we just guess based on keywords
            text_lower = text_command.lower()
            if "order" in text_lower or "buy" in text_lower:
                logic_result = "Action: Order, Item: [Detected from text]"
            elif "count" in text_lower:
                logic_result = "Action: Count Inventory"
            else:
                logic_result = f"Note: {text_command}"

        # Cleanup
        if os.path.exists(temp_input):
            os.remove(temp_input)
        if os.path.exists(temp_wav):
            os.remove(temp_wav)
        
        return {"transcript": text_command, "analysis": logic_result}

    except Exception as e:
        print(f"!!! VOICE ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))