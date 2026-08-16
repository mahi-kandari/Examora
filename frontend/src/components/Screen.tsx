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
          max-w-sm 
          md:max-w-2xl 
          lg:max-w-4xl 
          px-5 
          pt-8 
          ${withNav ? "pb-32" : "pb-8"} 
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