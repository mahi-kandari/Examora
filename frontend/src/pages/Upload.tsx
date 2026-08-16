import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { uploadFile } from "../services/exam";
import { db } from "../services/firebase";
import Screen from "../components/Screen";

type Status = "idle" | "uploading" | "error";

const steps = [
  "Uploading your admit card...",
  "Reading your document...",
  "Detecting important exam details...",
  "Identifying subjects and dates...",
  "Creating your exam schedule...",
  "Almost done ...",
];

const Upload: React.FC = () => {
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Progress animation and step rotation while waiting for OCR
  useEffect(() => {
    if (status !== "uploading" || !processingId) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 0.18, 92);
        // Advance step based on progress percentage
        const newStep = Math.min(
          Math.floor(next / (100 / steps.length)),
          steps.length - 1
        );
        setStepIndex(newStep);
        return next;
      });
    }, 1000 / 30);

    return () => clearInterval(interval);
  }, [status, processingId]);

  // Listen for Firestore completion
  useEffect(() => {
    if (!processingId) return;

    const unsubscribe = onSnapshot(doc(db, "exams", processingId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      if (data.status === "completed") {
        setProgress(100);
        setStepIndex(steps.length - 1); // "Almost done ..."
        setTimeout(() => {
          navigate(`/confirm/${processingId}`, {
            state: { exam: { ...data, id: processingId } },
          });
        }, 400);
      } else if (data.status === "error") {
        setStatus("error");
        setErrorMessage(data.error_message || "Processing failed.");
      }
    });

    return () => unsubscribe();
  }, [processingId, navigate]);

  const runUpload = async (file: File) => {
    setFileName(file.name);
    setStatus("uploading");
    setProgress(0);
    setStepIndex(0);
    setErrorMessage("");

    try {
      const response = await uploadFile(file);
      setProcessingId(response.id);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(
        err?.message === "Network Error" || !navigator.onLine
          ? "No internet connection, please try again."
          : "We couldn't read this document. Please make sure it is a clear photo or PDF."
      );
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 10 * 1024 * 1024) {
      setStatus("error");
      setErrorMessage("File exceeds 10MB.");
      return;
    }
    runUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <Screen className="flex flex-col min-h-screen justify-center relative">
      {/* Fixed back button – top left, always visible */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-6 left-4 z-50 text-muted text-sm hover:text-text-primary transition-colors"
      >
        ← Back
      </button>

      {status !== "error" && (
        <div className="glass p-7 animate-scaleIn">
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">📸</div>
            <h1 className="font-display font-semibold text-xl text-text-primary">
              Scan Admit Card
            </h1>
            <p className="text-muted text-sm mt-1.5">PDF or image, up to 10MB</p>
          </div>

          {status === "idle" && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-all duration-300 ${dragActive ? "border-accent bg-accent/5" : "border-accent/40"
                }`}
            >
              <div className="text-3xl mb-3">⬆️</div>
              <p className="text-text-primary text-sm font-medium">
                Tap to scan or drag & drop
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          )}

          {status === "uploading" && (
            <div className="animate-fadeInUp">
              <p className="text-text-primary text-sm font-medium truncate mb-4 text-center">
                {fileName}
              </p>
              <div className="h-2 rounded-full bg-stroke/20 overflow-hidden">
                <div
                  className="h-full bg-accent-gradient rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center text-muted text-sm mt-4">
                {steps[stepIndex]}
              </p>
            </div>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="glass p-7 text-center animate-scaleIn">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="font-display font-semibold text-lg text-text-primary mb-2">
            Upload failed
          </h2>
          <p className="text-muted text-sm mb-6">
            {errorMessage || "We couldn't process that file. Please try again."}
          </p>
          <button
            onClick={() => {
              setStatus("idle");
              setErrorMessage("");
              setProcessingId(null);
              setProgress(0);
              setStepIndex(0);
            }}
            className="btn-primary w-full"
          >
            Retry
          </button>
        </div>
      )}
    </Screen>
  );
};

export default Upload;