import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Screen from "../components/Screen";

const STORED_ORIGIN_KEY = "examora_user_origin";
const STORED_LOCATION_PERMISSION_KEY = "examora_location_permission";

interface PermissionStep {
  icon: string;
  heading: string;
  body: string;
}

const steps: PermissionStep[] = [
  {
    icon: "🔔",
    heading: "Turn on notifications",
    body: "Get gentle nudges before deadlines, departure times, and document checklists — timed just right.",
  },
  {
    icon: "📍",
    heading: "Share your location",
    body: "We'll estimate travel time to your test centre and tell you exactly when to leave.",
  },
];

const Permissions: React.FC = () => {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const step = steps[index];

  const advance = () => {
    if (index === steps.length - 1) {
      navigate("/home");
    } else {
      setIndex((i) => i + 1);
    }
  };

  const requestLocationAndAdvance = () => {
    if (!navigator.geolocation) {
      localStorage.removeItem(STORED_ORIGIN_KEY);
      localStorage.setItem(STORED_LOCATION_PERMISSION_KEY, "denied");
      advance();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        localStorage.setItem(
          STORED_ORIGIN_KEY,
          `${position.coords.latitude},${position.coords.longitude}`
        );
        localStorage.setItem(STORED_LOCATION_PERMISSION_KEY, "granted");
        advance();
      },
      () => {
        // Confirmation sends null after a denial and uses the backend's free
        // safe-departure fallback, so permission never blocks onboarding.
        localStorage.removeItem(STORED_ORIGIN_KEY);
        localStorage.setItem(STORED_LOCATION_PERMISSION_KEY, "denied");
        advance();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  const handleAllow = () => {
    if (index === steps.length - 1) {
      requestLocationAndAdvance();
      return;
    }
    advance();
  };

  const handleMaybeLater = () => {
    if (index === steps.length - 1) {
      localStorage.removeItem(STORED_ORIGIN_KEY);
      localStorage.setItem(STORED_LOCATION_PERMISSION_KEY, "denied");
    }
    advance();
  };

  return (
    <Screen className="flex items-center min-h-screen">
      <div key={index} className="w-full glass p-8 text-center animate-scaleIn">
        <div className="text-6xl mb-6 select-none">{step.icon}</div>
        <h2 className="font-display font-semibold text-xl text-text-primary mb-3">
          {step.heading}
        </h2>
        <p className="text-muted text-[15px] leading-relaxed mb-8">
          {step.body}
        </p>
        <div className="flex flex-col gap-3">
          <button onClick={handleAllow} className="btn-primary w-full">
            Allow
          </button>
          <button onClick={handleMaybeLater} className="btn-ghost w-full">
            Maybe later
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 mt-8">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-accent" : "w-1.5 bg-stroke/40"
                }`}
            />
          ))}
        </div>
      </div>
    </Screen>
  );
};

export default Permissions;
