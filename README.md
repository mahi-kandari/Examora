# Examora — Intelligent Exam Logistics & Day-Plan Assistant

Examora is a premium consumer web application built to eliminate exam-day anxiety for students. By combining OCR document parsing, real-time traffic-aware travel calculations (**Chronos**), and live GPS proximity tracking (**Geofence**), Examora automatically turns complex, text-heavy admit cards into a clean, stress-free exam day plan.

---

## ⚡ Core Features

- 📄 **Instant Admit Card OCR & Parsing**: Automatically extracts exam titles, dates, reporting times, gate closing deadlines, seat numbers, dress codes, and mandatory document checklists from PDFs and images.
- 🕒 **Chronos Travel Assistant**: Displays your exact recommended departure time, estimated travel duration, safety buffer status, and an interactive *"What if you leave later?"* departure simulator.
- 📡 **Live Geofence & Proximity Tracker**: Tracks your real-time GPS location relative to your test centre using Haversine distance math with road curvature adjustment, triggering alerts when inside the 2.0 km geofence zone.
- 📅 **1-Tap Google Calendar Sync**: Generates structured Google Calendar events pre-populated with reporting times, departure warnings, required document checklists, and direct Google Maps navigation links.
- 🎨 **Apple-Grade Consumer UI**: Built with SF Pro typography, harmonious light/dark themes, restraint-driven visual hierarchy, zero duplicate exam cards, and vector icon design.

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4 + Vanilla CSS Design Tokens
- **Icons**: Lucide React + Heroicons
- **Charts & Animation**: Chart.js, React-ChartJS-2, Framer Motion
- **Routing**: React Router v7

### **Backend & Engine**
- **Framework**: Python 3.11+ + FastAPI
- **OCR Engine**: EasyOCR, PyMuPDF (`fitz`), PyTesseract, OpenCV
- **Server**: Uvicorn
- **Database & Auth**: Firebase Authentication, Cloud Firestore (Real-time listeners)
- **Maps & Geolocation**: Browser Geolocation API + Google Maps Directions API

---

## 🔑 Required Local Environment Variables

Create a `.env` file in the root directory (refer to `.env.example`):

```env
# Path to your Firebase service account JSON key file
FIREBASE_CREDENTIALS=/path/to/service-account.json

# Background notification & reminder scheduler interval in minutes
SCHEDULER_INTERVAL_MINUTES=15

# (Optional) Google Maps API key for live traffic-aware travel estimates
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# (Optional) Writable path for ETA sample caching
CHRONOS_CACHE_PATH=/tmp/examora-eta_cache.json
```

For the **Frontend**, configure your Firebase project variables in `frontend/src/services/firebase.ts` (or `frontend/.env`):

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 📦 Dependencies & Installation

### **Prerequisites**
- **Node.js**: v18.0 or higher
- **Python**: v3.10 or higher
- **Tesseract OCR**: (Optional fallback for OCR)

---

### **1. Backend Setup**

```bash
# Navigate to repository root
cd examora-engine

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn backend.main:app --reload --port 8000
```

---

### **2. Frontend Setup**

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

The application will run locally at `http://localhost:5173`.

---

## 🧪 Verification & Production Build

To verify code correctness and build the production bundle:

```bash
cd frontend
npm run build
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
