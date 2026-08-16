import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Splash: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      navigate("/onboarding");
    }, 1800);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-app-gradient px-6">
      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="font-display font-semibold text-[48px] leading-none text-text-primary animate-glowPulse">
          Examora
        </h1>
        <p className="mt-4 text-muted text-sm tracking-wide">
          Preparing your command centre…
        </p>
      </div>

      <div className="w-full max-w-[180px] h-1 rounded-full bg-stroke/30 overflow-hidden mb-16">
        <div className="h-full w-1/2 bg-accent-gradient rounded-full animate-shimmer" />
      </div>
    </div>
  );
};

export default Splash;

