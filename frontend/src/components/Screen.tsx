import React from "react";
import BottomNav from "./BottomNav";

interface ScreenProps {
  children: React.ReactNode;
  withNav?: boolean;
  className?: string;
}

const Screen: React.FC<ScreenProps> = ({ children, withNav = false, className = "" }) => {
  return (
    <div className="relative min-h-screen w-full flex justify-center bg-[#050506] text-[#EDEDEF] overflow-x-hidden selection:bg-[#5E6AD2]/30 selection:text-white">
      {/* ---------- Layer 1: Base Radial Gradient Canvas ---------- */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,#0A0A12_0%,#050506_55%,#020203_100%)] z-0" />

      {/* ---------- Layer 2: Technical Grid Overlay ---------- */}
      <div className="fixed inset-0 pointer-events-none bg-grid-pattern opacity-60 z-0" />

      {/* ---------- Layer 3: Animated Ambient Indigo Blobs ---------- */}
      <div className="fixed -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[#5E6AD2]/20 blur-[140px] rounded-full pointer-events-none z-0 animate-floatPrimary" />
      <div className="fixed top-1/3 -left-32 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none z-0 animate-floatSecondary" />

      {/* ---------- Layer 4: Content Container ---------- */}
      <div
        className={`
          relative
          z-10
          w-full 
          max-w-md 
          sm:max-w-lg 
          md:max-w-2xl 
          lg:max-w-4xl 
          px-4 
          sm:px-6 
          pt-6 
          sm:pt-8 
          ${withNav ? "pb-36" : "pb-12"} 
          ${className}
        `}
      >
        {children}
      </div>

      {/* Bottom Navigation – fixed floating pill */}
      {withNav && <BottomNav />}
    </div>
  );
};

export default Screen;