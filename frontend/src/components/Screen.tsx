import React from "react";
import BottomNav from "./BottomNav";   // adjust path if needed

interface ScreenProps {
  children: React.ReactNode;
  withNav?: boolean;
  className?: string;
}

const Screen: React.FC<ScreenProps> = ({ children, withNav = false, className = "" }) => {
  return (
    <div className="min-h-screen w-full flex justify-center bg-app-gradient">
      <div
        className={`
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

      {/* Bottom Navigation – fixed, only when withNav is true */}
      {withNav && <BottomNav />}
    </div>
  );
};

export default Screen;