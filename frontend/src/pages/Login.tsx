import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";      // ← real Firebase auth
import Screen from "../components/Screen";               // keep as is (must exist)

type Mode = "signin" | "signup";

const Login: React.FC = () => {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

const { loginWithEmail, signupWithEmail, loginWithGoogle } = useAuth() as {
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
};  const navigate = useNavigate();

  const triggerError = (message: string) => {
    setError(message);
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || (mode === "signup" && !name)) {
      triggerError("Please fill in all fields to continue.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        await loginWithEmail(email, password);
      } else {
        await signupWithEmail(name, email, password);
      }
      navigate("/permissions");
    } catch (err: any) {
      triggerError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate("/permissions");
    } catch (err: any) {
      triggerError(err?.message || "Google sign‑in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen className="flex items-center min-h-screen">
      <div className={`w-full glass p-7 ${shake ? "animate-shake" : "animate-scaleIn"}`}>
        <div className="text-center mb-7">
          <h1 className="font-display font-semibold text-2xl text-text-primary">
            Examora
          </h1>
          <p className="text-muted text-sm mt-1.5">
            Your exam logistics, simplified.
          </p>
        </div>

        <div className="flex bg-stroke/10 rounded-2xl p-1 mb-6">
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              mode === "signin"
                ? "bg-accent/20 text-accent"
                : "text-muted"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              mode === "signup"
                ? "bg-accent/20 text-accent"
                : "text-muted"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
            autoComplete="email"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field pr-12"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted text-xs font-medium hover:text-accent transition-colors"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {error && (
            <p className="text-danger text-sm px-1">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create account"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-stroke/20" />
          <span className="text-xs text-muted">or</span>
          <div className="h-px flex-1 bg-stroke/20" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="btn-ghost w-full flex items-center justify-center gap-3"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path
              fill="#EA4335"
              d="M9 3.6c1.3 0 2.5.45 3.4 1.34l2.55-2.55C13.44.9 11.37 0 9 0 5.48 0 2.44 2.02.96 4.96l2.98 2.31C4.6 5.1 6.62 3.6 9 3.6Z"
            />
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
            />
            <path
              fill="#FBBC05"
              d="M3.94 10.73A5.4 5.4 0 0 1 3.66 9c0-.6.1-1.19.28-1.73V4.99H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02l2.98-2.29Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.37 0 4.36-.78 5.82-2.12l-2.9-2.26c-.8.55-1.84.87-2.92.87-2.38 0-4.4-1.5-5.06-3.67L.96 13.02C2.44 15.98 5.48 18 9 18Z"
            />
          </svg>
          <span className="text-sm">Continue with Google</span>
        </button>

        <p className="text-center text-xs text-muted mt-6 leading-relaxed">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </Screen>
  );
};

export default Login;