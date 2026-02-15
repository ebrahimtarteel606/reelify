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
  title?: string;
  company?: string;
  notes?: string;
  priority?: string;
  source?: string;
}

interface UsageEvent {
  id: string;
  user_id: string;
  source_duration_minutes: number;
  credits_charged: number;
  created_at: string;
}

interface DemoRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  help_text: string;
  locale: string | null;
  status: string;
  created_at: string;
}

type Tab = "users" | "demo-requests";

// ── Helpers ────────────────────────────────────────────────────
function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtMin(m: number) {
  return m === 1 ? "1 min" : `${m} min`;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  contacted: "bg-blue-100 text-blue-800",
  converted: "bg-green-100 text-green-800",
  dismissed: "bg-gray-100 text-gray-600",
};

const STATUS_OPTIONS = ["pending", "contacted", "converted", "dismissed"];

// ── Component ──────────────────────────────────────────────────
export default function AdminDashboard() {
  // Auth
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");

  // Tab
  const [activeTab, setActiveTab] = useState<Tab>("users");

  // Data – Users
  const [users, setUsers] = useState<CreditUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Data – Demo Requests
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoStatusFilter, setDemoStatusFilter] = useState<string>("all");
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  // Create user modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCredits, setNewCredits] = useState(180);
  const [newTitle, setNewTitle] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newPriority, setNewPriority] = useState("");
  const [newSource, setNewSource] = useState("");

  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCredits, setEditCredits] = useState(0);

  // Usage detail drawer
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  // User detail card (eye icon)
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

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

  // ── Fetch demo requests ────────────────────────────────────
  const fetchDemoRequests = useCallback(async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/admin/demo-requests", {
        headers: { "x-admin-secret": secret },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDemoRequests(data.demo_requests ?? []);
    } catch {
      setDemoRequests([]);
    } finally {
      setDemoLoading(false);
    }
  }, [secret]);

  // Load demo requests when tab switches
  useEffect(() => {
    if (authenticated && activeTab === "demo-requests") {
      fetchDemoRequests();
    }
  }, [authenticated, activeTab, fetchDemoRequests]);

  // ── Update demo request status ─────────────────────────────
  const updateDemoStatus = async (id: string, status: string) => {
    await fetch("/api/admin/demo-requests", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ id, status }),
    });
    posthog.capture("admin_demo_status_updated", { id, status });
    await fetchDemoRequests();
  };

  // ── Delete demo request ────────────────────────────────────
  const deleteDemoRequest = async (id: string) => {
    if (!confirm("Delete this demo request?")) return;
    await fetch(`/api/admin/demo-requests?id=${id}`, {
      method: "DELETE",
      headers: headers(),
    });
    posthog.capture("admin_demo_deleted", { id });
    if (expandedRequestId === id) setExpandedRequestId(null);
    await fetchDemoRequests();
  };

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

  // ── Auto logout after 5 minutes of inactivity ───────────────
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
        title: newTitle.trim() || undefined,
        company: newCompany.trim() || undefined,
        notes: newNotes.trim() || undefined,
        priority: newPriority.trim() || undefined,
        source: newSource.trim() || undefined,
      }),
    });
    posthog.capture("admin_user_created", {
      credits_initial: newCredits,
    });
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewCredits(180);
    setNewTitle("");
    setNewCompany("");
    setNewNotes("");
    setNewPriority("");
    setNewSource("");
    setShowCreate(false);
    await fetchUsers();
  };

  const closeCreateModal = () => {
    setShowCreate(false);
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

  // ── Filtered demo requests ──────────────────────────────────
  const filteredDemoRequests =
    demoStatusFilter === "all"
      ? demoRequests
      : demoRequests.filter((r) => r.status === demoStatusFilter);

  const demoCounts = {
    all: demoRequests.length,
    pending: demoRequests.filter((r) => r.status === "pending").length,
    contacted: demoRequests.filter((r) => r.status === "contacted").length,
    converted: demoRequests.filter((r) => r.status === "converted").length,
    dismissed: demoRequests.filter((r) => r.status === "dismissed").length,
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
              onClick={() => {
                if (activeTab === "users") fetchUsers();
                else fetchDemoRequests();
              }}
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

        {/* Tab navigation */}
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1">
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative ${
                activeTab === "users"
                  ? "text-pink-600 bg-gray-50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50/50"
              }`}
            >
              Users
              {activeTab === "users" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-pink-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("demo-requests")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative flex items-center gap-2 ${
                activeTab === "demo-requests"
                  ? "text-pink-600 bg-gray-50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50/50"
              }`}
            >
              Demo Requests
              {demoCounts.pending > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800 min-w-[20px]">
                  {demoCounts.pending}
                </span>
              )}
              {activeTab === "demo-requests" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-pink-500 rounded-full" />
              )}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* ─── Users Tab ──────────────────────────────────────── */}
        {activeTab === "users" && (
          <>
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
                  onClick={() => setShowCreate(true)}
                  className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 text-white font-medium hover:shadow-md transition-all"
                >
                  + New User
                </button>
              </div>

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
                                onClick={() => setDetailUserId(user.id)}
                                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                                title="View details"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
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

            {/* Create user modal */}
            {showCreate && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                onClick={closeCreateModal}
              >
                <div
                  className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-md w-full max-h-[90vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900">New user</h2>
                    <button
                      onClick={closeCreateModal}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                      aria-label="Close"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Name</label>
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="User name"
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Title</label>
                      <input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Job title"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Email</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="user@example.com"
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Phone</label>
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+1234567890"
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Company</label>
                      <input
                        value={newCompany}
                        onChange={(e) => setNewCompany(e.target.value)}
                        placeholder="Company name"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Credits (min)</label>
                      <input
                        type="number"
                        value={newCredits}
                        onChange={(e) => setNewCredits(Number(e.target.value))}
                        min={0}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Priority</label>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                      >
                        <option value="">—</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Source</label>
                      <input
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                        placeholder="e.g. Ibrahim, Haddad"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                      <textarea
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        placeholder="Internal notes"
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 resize-y"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                      >
                        Create user
                      </button>
                      <button
                        type="button"
                        onClick={closeCreateModal}
                        className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* User detail card (eye icon modal) */}
            {detailUserId && (() => {
              const user = users.find((u) => u.id === detailUserId);
              if (!user) return null;
              return (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                  onClick={() => setDetailUserId(null)}
                >
                  <div
                    className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-md w-full max-h-[90vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                      <h2 className="font-semibold text-gray-900">User details</h2>
                      <button
                        onClick={() => setDetailUserId(null)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                        aria-label="Close"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="px-6 py-4 space-y-4">
                      <div>
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Name</div>
                        <div className="text-gray-900 font-medium">{user.display_name}</div>
                      </div>
                      {user.title ? (
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Title</div>
                          <div className="text-gray-700">{user.title}</div>
                        </div>
                      ) : null}
                      <div>
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</div>
                        <div className="text-gray-700">{user.email}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Phone</div>
                        <div className="text-gray-700">{user.phone || "—"}</div>
                      </div>
                      {user.company ? (
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Company</div>
                          <div className="text-gray-700">{user.company}</div>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Credits left</div>
                          <div className="text-gray-700">{fmtMin(user.credits_remaining)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Credits used</div>
                          <div className="text-gray-700">{fmtMin(user.usage.total_credits_used)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Requests</div>
                          <div className="text-gray-700">{user.usage.request_count}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Last active</div>
                          <div className="text-gray-700 text-sm">{formatDate(user.usage.last_used)}</div>
                        </div>
                      </div>
                      {user.priority ? (
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Priority</div>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${user.priority === "High" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                            {user.priority}
                          </span>
                        </div>
                      ) : null}
                      {user.source ? (
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Source</div>
                          <div className="text-gray-700">{user.source}</div>
                        </div>
                      ) : null}
                      <div>
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Created</div>
                        <div className="text-gray-700 text-sm">{formatDate(user.created_at)}</div>
                      </div>
                      {user.notes ? (
                        <div>
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notes</div>
                          <div className="text-gray-700 text-sm whitespace-pre-wrap">{user.notes}</div>
                        </div>
                      ) : null}
                      <div>
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">User ID</div>
                        <button
                          onClick={() => copyId(user.id)}
                          className="text-xs font-mono text-gray-500 hover:text-gray-700 break-all text-left"
                        >
                          {user.id}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

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
                            <td className="px-6 py-3 text-gray-700">
                              {fmtMin(ev.credits_charged)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ─── Demo Requests Tab ──────────────────────────────── */}
        {activeTab === "demo-requests" && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryCard label="Total Requests" value={demoCounts.all} />
              <SummaryCard label="Pending" value={demoCounts.pending} />
              <SummaryCard label="Contacted" value={demoCounts.contacted} />
              <SummaryCard label="Converted" value={demoCounts.converted} />
            </div>

            {/* Demo requests table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-semibold text-gray-900">Demo Requests</h2>
                {/* Status filter pills */}
                <div className="flex items-center gap-1.5">
                  {(["all", ...STATUS_OPTIONS] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setDemoStatusFilter(status)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors capitalize ${
                        demoStatusFilter === status
                          ? "bg-pink-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {status}{" "}
                      <span className="opacity-70">
                        ({demoCounts[status as keyof typeof demoCounts] ?? 0})
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {demoLoading ? (
                <div className="px-6 py-12 text-center text-gray-400">Loading...</div>
              ) : filteredDemoRequests.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400">
                  {demoStatusFilter === "all"
                    ? "No demo requests yet."
                    : `No ${demoStatusFilter} requests.`}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        <th className="px-6 py-3">Name</th>
                        <th className="px-6 py-3">Email</th>
                        <th className="px-6 py-3">Phone</th>
                        <th className="px-6 py-3">Locale</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredDemoRequests.map((req) => (
                        <>
                          <tr
                            key={req.id}
                            className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                              expandedRequestId === req.id ? "bg-pink-50" : ""
                            }`}
                            onClick={() =>
                              setExpandedRequestId(
                                expandedRequestId === req.id ? null : req.id
                              )
                            }
                          >
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{req.name}</div>
                            </td>
                            <td className="px-6 py-4">
                              <a
                                href={`mailto:${req.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-pink-600 hover:text-pink-700 hover:underline"
                              >
                                {req.email}
                              </a>
                            </td>
                            <td className="px-6 py-4 text-gray-700">
                              <a
                                href={`tel:${req.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-pink-600 hover:underline"
                              >
                                {req.phone}
                              </a>
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-xs uppercase">
                              {req.locale ?? "—"}
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={req.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateDemoStatus(req.id, e.target.value)}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-400 ${
                                  STATUS_STYLES[req.status] ?? "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s} className="capitalize">
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-xs">
                              {formatDate(req.created_at)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteDemoRequest(req.id);
                                }}
                                className="px-3 py-1 text-xs rounded-lg text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                          {/* Expanded help text row */}
                          {expandedRequestId === req.id && (
                            <tr key={`${req.id}-detail`}>
                              <td colSpan={7} className="px-6 py-4 bg-gray-50">
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Message
                                  </p>
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                    {req.help_text}
                                  </p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
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
