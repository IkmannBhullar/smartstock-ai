'use client';

import { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, Mic, Loader2, CheckCircle, Package, BrainCircuit } from 'lucide-react';

export default function Home() {
  const webcamRef = useRef<Webcam>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Data from AI
  const [inventory, setInventory] = useState<any[]>([]);
  const [voiceNote, setVoiceNote] = useState<any>(null);

  // 1. CAPTURE IMAGE
  const capture = useCallback(async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    setImgSrc(imageSrc);
    setLoading(true);

    try {
      // Convert Base64 image to a Blob to send to Python
      const blob = await fetch(imageSrc!).then((res) => res.blob());
      const formData = new FormData();
      formData.append('file', blob, 'capture.jpg');

      // Send to Backend
      const response = await fetch('http://127.0.0.1:8000/analyze-image', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      console.log("AI RESPONSE:", data); // <--- ADD THIS LINE

      setInventory(data.items);
    } catch (error) {
      console.error('Error analyzing image:', error);
    } finally {
      setLoading(false);
    }
  }, [webcamRef]);

  // 2. RECORD VOICE (Simple Native Browser API)
  const startRecording = async () => {
    setIsRecording(true);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks: BlobPart[] = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const formData = new FormData();
      formData.append('file', audioBlob, 'voice.wav');
      
      setLoading(true);
      try {
        const response = await fetch('http://127.0.0.1:8000/process-voice', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();



        setVoiceNote(data);
      } catch (error) {
        console.error('Error processing voice:', error);
      } finally {
        setLoading(false);
        setIsRecording(false);
      }
    };

    mediaRecorder.start();
    // Record for 5 seconds automatically (for simplicity)
    setTimeout(() => {
      mediaRecorder.stop();
    }, 5000);
  };

  return (
    <main className="min-h-screen bg-black text-white p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-2">
        <BrainCircuit className="text-blue-500" /> SmartStock AI
      </h1>

      {/* CAMERA SECTION */}
      <div className="bg-gray-900 p-4 rounded-xl mb-6 border border-gray-800">
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video mb-4">
          {!imgSrc ? (
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              className="w-full h-full object-cover"
            />
          ) : (
            <img src={imgSrc} alt="Captured" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setImgSrc(null)} 
            className="flex-1 bg-gray-800 py-3 rounded-lg font-medium hover:bg-gray-700 transition"
          >
            Reset Camera
          </button>
          <button
            onClick={capture}
            disabled={loading || !!imgSrc}
            className="flex-1 bg-blue-600 py-3 rounded-lg font-medium hover:bg-blue-500 transition flex justify-center items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Camera size={20} />}
            Scan Shelf
          </button>
        </div>
      </div>

      {/* RESULTS SECTION */}
      {inventory?.length > 0 && (
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-6 animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Package className="text-green-500" /> Detected Items
          </h2>
          <div className="space-y-2">
            {inventory.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center bg-gray-800 p-3 rounded-lg">
                <span className="capitalize text-lg">{item.object}</span>
                <span className="text-sm text-gray-400 bg-gray-900 px-2 py-1 rounded">
                  {item.confidence} conf
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VOICE COMMAND SECTION */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
        <h2 className="text-xl font-semibold mb-4">Voice Commands</h2>
        
        <button
          onClick={startRecording}
          disabled={isRecording || loading}
          className={`w-full py-6 rounded-xl font-bold text-lg transition flex flex-col items-center gap-2 ${
            isRecording ? 'bg-red-500/20 text-red-500 border-2 border-red-500' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          {isRecording ? (
            <>
              <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
              Listening... (5s)
            </>
          ) : (
            <>
              <Mic size={24} />
              Hold to Add Task
            </>
          )}
        </button>

        {voiceNote && (
          <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <p className="text-gray-400 text-sm mb-2">"{voiceNote.transcript}"</p>
            <div className="flex items-start gap-2 text-green-400">
              <CheckCircle size={20} className="mt-1" />
              <p className="font-mono">{voiceNote.analysis}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}