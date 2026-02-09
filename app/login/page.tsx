"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import posthog from "posthog-js";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = userId.trim();
    if (!trimmed) {
      setError("Please enter your User ID.");
      return;
    }

    setLoading(true);
    posthog.capture("login_attempted");

    try {
      // Validate the user ID exists by calling the process API's user check
      // We'll use a lightweight validation endpoint
      const res = await fetch("/api/admin/validate-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json();
        const errorMsg = data.error || "Invalid User ID.";
        posthog.capture("login_failed", { error_message: errorMsg });
        setError(errorMsg);
        setLoading(false);
        return;
      }

      // Identify user in PostHog
      posthog.identify(trimmed);
      posthog.capture("login_succeeded");

      // Set the user_id cookie (expires in 1 year)
      document.cookie = `reelify_user_id=${trimmed}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;

      // Also store in localStorage for the API form data
      localStorage.setItem("reelify_user_id", trimmed);

      // Redirect to the intended destination or home
      const next = searchParams.get("next") || "/";
      router.push(next);
    } catch {
      posthog.capture("login_failed", { error_message: "Network error" });
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          {/* Logo / Title */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
              Reelify
            </h1>
            <p className="text-sm text-gray-500">Enter your User ID to continue</p>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <label
              htmlFor="user-id"
              className="block text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              User ID
            </label>
            <input
              id="user-id"
              type="text"
              placeholder="e.g. a1b2c3d4-e5f6-..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-shadow"
              autoFocus
              autoComplete="off"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 text-center bg-red-50 rounded-lg py-2 px-3">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !userId.trim()}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-pink-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying..." : "Continue"}
          </button>

          {/* Help text */}
          <p className="text-xs text-gray-400 text-center">
            Don&apos;t have a User ID? Contact your administrator.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="text-gray-400">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
