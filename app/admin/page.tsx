"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import posthog from "posthog-js";

const ADMIN_INACTIVITY_MS = 60 * 1000 * 5; // 5 minutes

// ── Types ──────────────────────────────────────────────────────
interface UserUsage {
  total_credits_used: number;
  total_duration: number;
  request_count: number;
  last_used: string | null;
}

interface CreditUser {
  id: string;
  display_name: string;
  email: string;
  phone: string;
  credits_remaining: number;
  created_at: string;
  usage: UserUsage;
}

interface UsageEvent {
  id: string;
  user_id: string;
  source_duration_minutes: number;
  credits_charged: number;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────
function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtMin(m: number) {
  return m === 1 ? "1 min" : `${m} min`;
}

// ── Component ──────────────────────────────────────────────────
export default function AdminDashboard() {
  // Auth
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");

  // Data
  const [users, setUsers] = useState<CreditUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCredits, setNewCredits] = useState(180);

  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCredits, setEditCredits] = useState(0);

  // Usage detail drawer
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "x-admin-secret": secret }),
    [secret]
  );

  // ── Fetch users ─────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: { "x-admin-secret": secret } });
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      setUsers(data.users ?? []);
      setAuthenticated(true);
      setAuthError("");
      posthog.capture("admin_logged_in");
    } catch {
      setAuthError("Invalid secret or server error");
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [secret]);

  // ── Usage events for a user ──────────────────────────────────
  const fetchUsage = useCallback(
    async (userId: string) => {
      setUsageLoading(true);
      try {
        const res = await fetch(`/api/admin/usage?user_id=${userId}`, {
          headers: { "x-admin-secret": secret },
        });
        const data = await res.json();
        setUsageEvents(data.events ?? []);
      } catch {
        setUsageEvents([]);
      } finally {
        setUsageLoading(false);
      }
    },
    [secret]
  );

  useEffect(() => {
    if (selectedUserId) fetchUsage(selectedUserId);
  }, [selectedUserId, fetchUsage]);

  // ── Login ────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchUsers();
  };

  // ── Auto logout after 1 minute of inactivity (admin only) ───
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logoutFromInactivity = useCallback(() => {
    setAuthenticated(false);
    setSecret("");
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    const resetTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      inactivityTimerRef.current = setTimeout(logoutFromInactivity, ADMIN_INACTIVITY_MS);
    };

    resetTimer();
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [authenticated, logoutFromInactivity]);

  // ── Create user ──────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/admin/users", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        display_name: newName,
        email: newEmail.trim(),
        phone: newPhone.trim(),
        credits_remaining: newCredits,
      }),
    });
    posthog.capture("admin_user_created", {
      credits_initial: newCredits,
    });
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewCredits(180);
    setShowCreate(false);
    await fetchUsers();
  };

  // ── Update user ──────────────────────────────────────────────
  const handleSaveEdit = async (userId: string) => {
    const user = users.find((u) => u.id === userId);
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({
        id: userId,
        email: editEmail.trim(),
        phone: editPhone.trim(),
        credits_remaining: editCredits,
      }),
    });
    posthog.capture("admin_user_updated", {
      user_id: userId,
      credits_before: user?.credits_remaining ?? null,
      credits_after: editCredits,
    });
    setEditingId(null);
    await fetchUsers();
  };

  // ── Delete user ──────────────────────────────────────────────
  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this user and all their usage data?")) return;
    await fetch(`/api/admin/users?id=${userId}`, {
      method: "DELETE",
      headers: headers(),
    });
    posthog.capture("admin_user_deleted", { user_id: userId });
    if (selectedUserId === userId) {
      setSelectedUserId(null);
      setUsageEvents([]);
    }
    await fetchUsers();
  };

  // ── Copy user ID ─────────────────────────────────────────────
  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
  };

  // ── Auth gate ────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-6"
        >
          <h1 className="text-2xl font-bold text-center text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 text-center">Enter your admin password to continue</p>
          <input
            type="password"
            placeholder="Admin password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-coral-500 focus:border-transparent"
            autoFocus
          />
          {authError && <p className="text-sm text-red-500 text-center">{authError}</p>}
          <button
            type="submit"
            disabled={!secret || loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm hover:shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? "Checking..." : "Sign In"}
          </button>
        </form>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Reelify Admin</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchUsers()}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={() => {
                setAuthenticated(false);
                setSecret("");
              }}
              className="px-4 py-2 text-sm rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard label="Total Users" value={users.length} />
          <SummaryCard
            label="Total Requests"
            value={users.reduce((s, u) => s + u.usage.request_count, 0)}
          />
          <SummaryCard
            label="Total Credits Used"
            value={fmtMin(users.reduce((s, u) => s + u.usage.total_credits_used, 0))}
          />
        </div>

        {/* Users table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Users</h2>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 text-white font-medium hover:shadow-md transition-all"
            >
              {showCreate ? "Cancel" : "+ New User"}
            </button>
          </div>

          {/* Create user form */}
          {showCreate && (
            <form
              onSubmit={handleCreate}
              className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex flex-wrap items-end gap-4"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="User name"
                  required
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Phone</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+1234567890"
                  required
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Credits (min)</label>
                <input
                  type="number"
                  value={newCredits}
                  onChange={(e) => setNewCredits(Number(e.target.value))}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg w-28 focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
              >
                Create
              </button>
            </form>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Credits Left</th>
                  <th className="px-6 py-3">Used</th>
                  <th className="px-6 py-3">Requests</th>
                  <th className="px-6 py-3">Last Active</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-gray-50 transition-colors ${selectedUserId === user.id ? "bg-pink-50" : ""}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{user.display_name}</div>
                      <button
                        onClick={() => copyId(user.id)}
                        className="text-xs text-gray-400 hover:text-gray-600 font-mono transition-colors"
                        title="Click to copy user ID"
                      >
                        {user.id.slice(0, 8)}...
                      </button>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {editingId === user.id ? (
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-44 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                        />
                      ) : (
                        <span className="text-gray-700">{user.email}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {editingId === user.id ? (
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-36 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                        />
                      ) : (
                        <span className="text-gray-700">{user.phone}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingId === user.id ? (
                        <input
                          type="number"
                          value={editCredits}
                          onChange={(e) => setEditCredits(Number(e.target.value))}
                          className="w-24 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                        />
                      ) : (
                        <span
                          className={`font-medium ${user.credits_remaining <= 1 ? "text-red-500" : "text-gray-700"}`}
                        >
                          {fmtMin(user.credits_remaining)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {fmtMin(user.usage.total_credits_used)}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{user.usage.request_count}</td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {formatDate(user.usage.last_used)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {editingId === user.id ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(user.id)}
                            className="px-3 py-1 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(user.id);
                              setEditEmail(user.email);
                              setEditPhone(user.phone);
                              setEditCredits(user.credits_remaining);
                            }}
                            className="px-3 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() =>
                              setSelectedUserId(selectedUserId === user.id ? null : user.id)
                            }
                            className="px-3 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                          >
                            {selectedUserId === user.id ? "Hide" : "Usage"}
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="px-3 py-1 text-xs rounded-lg text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                      No users yet. Create one to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Usage events drawer */}
        {selectedUserId && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                Usage History — {users.find((u) => u.id === selectedUserId)?.display_name}
              </h2>
            </div>
            {usageLoading ? (
              <div className="px-6 py-8 text-center text-gray-400">Loading...</div>
            ) : usageEvents.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">No usage events yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Duration</th>
                      <th className="px-6 py-3">Credits Charged</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {usageEvents.map((ev) => (
                      <tr key={ev.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-500 text-xs">
                          {formatDate(ev.created_at)}
                        </td>
                        <td className="px-6 py-3 text-gray-700">
                          {fmtMin(ev.source_duration_minutes)}
                        </td>
                        <td className="px-6 py-3 text-gray-700">{fmtMin(ev.credits_charged)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Summary card component ──────────────────────────────────────
function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
