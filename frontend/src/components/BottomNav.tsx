import React from "react";
import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/home", label: "Home", icon: HomeIcon },
  { to: "/exams", label: "Exams", icon: ExamsIcon },
  { to: "/profile", label: "Profile", icon: ProfileIcon },
];

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 11.5 12 4l8 7.5"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExamsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect
        x="5"
        y="3.5"
        width="12"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
      />
      <path
        d="M8.5 8h5M8.5 11.5h5M8.5 15h3"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
      />
      <path
        d="M17 6.5h1.5A1.5 1.5 0 0 1 20 8v11a1.5 1.5 0 0 1-1.5 1.5H9"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="8"
        r="3.4"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
      />
      <path
        d="M5 20c1.2-3.6 4-5.4 7-5.4s5.8 1.8 7 5.4"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

const BottomNav: React.FC = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm glass !rounded-t-3xl !rounded-b-2xl border-t border-stroke/30 px-2 py-2">
        <ul className="flex items-center justify-around">
          {tabs.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className="flex flex-col items-center gap-1 py-2 rounded-2xl transition-colors"
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`h-1 w-1 rounded-full mb-0.5 transition-opacity ${
                        isActive ? "bg-accent opacity-100" : "opacity-0"
                      }`}
                    />
                    <span className={isActive ? "text-accent" : "text-muted"}>
                      <Icon active={isActive} />
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        isActive ? "text-accent" : "text-muted"
                      }`}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default BottomNav;
