import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Calendar, User } from "lucide-react";
import { motion } from "framer-motion";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/exams", label: "Exams", icon: Calendar },
  { to: "/profile", label: "Profile", icon: User },
];

const BottomNav: React.FC = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md bg-[#0A0A0C]/85 backdrop-blur-xl border border-white/[0.06] rounded-full p-2 shadow-2xl shadow-black/80">
        <ul className="flex items-center justify-around">
          {tabs.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  className="relative flex items-center justify-center py-2 px-3 rounded-full transition-all"
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabPill"
                      className="absolute inset-0 bg-[#5E6AD2] rounded-full shadow-[0_0_18px_rgba(94,106,210,0.45)]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <div
                    className={`relative z-10 flex items-center gap-2 ${
                      isActive
                        ? "text-white font-semibold"
                        : "text-[#8A8F98] hover:text-[#EDEDEF]"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {isActive && (
                      <span className="text-xs font-semibold tracking-wide">
                        {label}
                      </span>
                    )}
                  </div>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
};

export default BottomNav;
