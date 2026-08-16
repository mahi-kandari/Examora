import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Slide {
  icon: string;
  heading: string;
  body: string;
  accentLine?: string;
}

const slides: Slide[] = [
  {
    icon: "🔍",
    heading: "Admit cards hide what matters.",
    body: "Gate numbers, dress codes, reporting times — buried in dense text you skim past when it counts most.",
    accentLine: "We find them instantly.",
  },
  {
    icon: "📋",
    heading: "Upload once. Everything's clear.",
    body: "Scan or upload your admit card and Examora extracts every detail into one clean, readable plan.",
  },
  {
    icon: "🔔",
    heading: "Reminders that feel reassuring.",
    body: "Personalised nudges for documents, departure time, and the little things you'd hate to forget.",
  },
];

const Onboarding: React.FC = () => {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const slide = slides[index];
  const isLast = index === slides.length - 1;

  const next = () => {
    if (isLast) {
      navigate("/login");
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div className="min-h-screen w-full flex justify-center bg-app-gradient">
      <div className="w-full max-w-sm px-6 flex flex-col min-h-screen">
        <div className="flex justify-end pt-6">
          <button
            onClick={() => navigate("/login")}
            className="text-sm text-muted hover:text-text-primary transition-colors"
          >
            Skip
          </button>
        </div>

        <div
          key={index}
          className="flex-1 flex flex-col items-center justify-center text-center animate-fadeInUp"
        >
          <div className="text-6xl mb-8 select-none">{slide.icon}</div>
          <h2 className="font-display font-semibold text-2xl leading-snug text-text-primary mb-4">
            {slide.heading}
          </h2>
          <p className="text-muted text-[15px] leading-relaxed max-w-[280px]">
            {slide.body}
          </p>
          {slide.accentLine && (
            <p className="mt-3 text-accent font-medium text-[15px]">
              {slide.accentLine}
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-accent" : "w-1.5 bg-stroke/40"
              }`}
            />
          ))}
        </div>

        <div className="pb-10">
          {isLast ? (
            <button onClick={next} className="btn-primary w-full">
              Get started free
            </button>
          ) : (
            <button onClick={next} className="btn-primary w-full">
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
