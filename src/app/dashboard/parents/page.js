"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const PHONE_PREFIXES = ["+1", "+44", "+972", "+61", "+49", "+33", "+34", "+39", "+81", "+86"];

export default function ParentsPage() {
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedParent, setSelectedParent] = useState(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ firstName: "", lastName: "", email: "", phonePrefix: "+1", phone: "" });

  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    fetchParents();
  }, []);

  async function fetchParents() {
    try {
      const res = await fetch("/api/parents");
      const data = await res.json();
      if (res.ok) setParents(data.parents);
    } catch (err) {
      console.error("Failed to fetch:", err);
    } finally {
      setLoading(false);
    }
  }

  async function refreshParent(parentId) {
    const res = await fetch(`/api/parents/${parentId}`);
    const data = await res.json();
    if (res.ok) {
      setSelectedParent(data.parent);
      fetchParents();
    }
  }

  function openParent(parent) {
    setSelectedParent(parent);
    setEditingInfo(false);
    setInfoForm(null);
    setFormError("");
  }

  function closeParent() {
    setSelectedParent(null);
    setEditingInfo(false);
    setInfoForm(null);
    setFormError("");
  }

  function startEditInfo() {
    setEditingInfo(true);
    setInfoForm({
      firstName: selectedParent.firstName,
      lastName: selectedParent.lastName,
      email: selectedParent.email,
      phonePrefix: selectedParent.phonePrefix || "+1",
      phone: selectedParent.phone,
    });
    setFormError("");
  }

  async function saveInfo() {
    setFormLoading(true);
    setFormError("");
    try {
      const res = await fetch(`/api/parents/${selectedParent._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(infoForm),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "Failed to save"); return; }
      setSelectedParent(data.parent);
      setEditingInfo(false);
      setInfoForm(null);
      fetchParents();
    } catch (err) {
      setFormError("Something went wrong");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleCreateParent(e) {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      const res = await fetch("/api/parents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "Failed to create"); setFormLoading(false); return; }
      setShowCreateForm(false);
      setCreateForm({ firstName: "", lastName: "", email: "", phonePrefix: "+1", phone: "" });
      fetchParents();
      openParent(data.parent);
    } catch (err) {
      setFormError("Something went wrong");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeleteParent(parentId) {
    if (!confirm("Delete this parent? Their link to players will be removed.")) return;
    try {
      const res = await fetch(`/api/parents/${parentId}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedParent?._id === parentId) closeParent();
        fetchParents();
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><p className="text-gray-500">Loading parents...</p></div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Parents</h2>
        <button onClick={() => { setShowCreateForm(true); setFormError(""); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          + Add Parent
        </button>
      </div>

      {/* Create Parent Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Parent</h3>
            <form onSubmit={handleCreateParent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input type="text" value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} required className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input type="text" value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} required className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <div className="flex gap-2">
                  <select value={createForm.phonePrefix} onChange={(e) => setCreateForm({ ...createForm, phonePrefix: e.target.value })} className="w-24 px-2 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
                    {PHONE_PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input type="tel" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} required className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                </div>
              </div>
              {formError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">{formError}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateForm(false)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={formLoading} className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">
                  {formLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Parent Detail Modal */}
      {selectedParent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Parent Profile</h3>
              <button onClick={closeParent} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Parent Info */}
            {!editingInfo ? (
              <div className="bg-gray-50 rounded-lg p-4 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">{selectedParent.firstName} {selectedParent.lastName}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{selectedParent.email}</p>
                    <p className="text-sm text-gray-500">{selectedParent.phonePrefix} {selectedParent.phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedParent.emailVerified && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Verified</span>}
                    <button onClick={startEditInfo} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white transition">Edit</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 mb-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" value={infoForm.firstName} onChange={(e) => setInfoForm({ ...infoForm, firstName: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="First name" />
                  <input type="text" value={infoForm.lastName} onChange={(e) => setInfoForm({ ...infoForm, lastName: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Last name" />
                </div>
                <input type="email" value={infoForm.email} onChange={(e) => setInfoForm({ ...infoForm, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Email" />
                <div className="flex gap-2">
                  <select value={infoForm.phonePrefix} onChange={(e) => setInfoForm({ ...infoForm, phonePrefix: e.target.value })} className="w-24 px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
                    {PHONE_PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input type="tel" value={infoForm.phone} onChange={(e) => setInfoForm({ ...infoForm, phone: e.target.value })} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Phone" />
                </div>
                {formError && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg border border-red-200">{formError}</div>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setEditingInfo(false); setInfoForm(null); setFormError(""); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-white transition">Cancel</button>
                  <button onClick={saveInfo} disabled={formLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                    {formLoading ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}

            {/* Linked Players */}
            <h4 className="font-semibold text-gray-900 mb-3">Children ({selectedParent.players?.length || 0})</h4>
            {!selectedParent.players || selectedParent.players.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">
                <p>No players linked to this parent.</p>
                <p className="mt-1">Link players from the <Link href="/dashboard/players" className="text-blue-600 hover:underline">Players</Link> tab.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedParent.players.map((pl) => (
                  <div key={pl._id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {pl.firstName?.[0]}{pl.lastName?.[0]}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">{pl.firstName} {pl.lastName}</p>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {pl.gender && <span className="mr-3">{pl.gender}</span>}
                          {pl.dateOfBirth && <span className="mr-3">DOB: {new Date(pl.dateOfBirth).toLocaleDateString()}</span>}
                          {pl.primaryPosition && <span className="mr-3">{pl.primaryPosition}</span>}
                          {pl.school && <span>School: {pl.school}</span>}
                        </div>
                      </div>
                    </div>
                    <Link
                      href="/dashboard/players"
                      className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parents List */}
      {parents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Parents Yet</h3>
          <p className="text-gray-500 mb-4">Parents will appear here when created via CSV import or added manually.</p>
          <button onClick={() => setShowCreateForm(true)} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition">+ Add Parent</button>
        </div>
      ) : (
        <div className="space-y-3">
          {parents.map((parent) => (
            <div key={parent._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-5 flex items-center justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => openParent(parent)}>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{parent.firstName} {parent.lastName}</h3>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      {parent.players?.length || 0} player{(parent.players?.length || 0) !== 1 ? "s" : ""}
                    </span>
                    {parent.emailVerified && (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Verified</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-gray-500">{parent.email}</span>
                    <span className="text-sm text-gray-500">{parent.phonePrefix} {parent.phone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openParent(parent)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition">View</button>
                  <button onClick={() => handleDeleteParent(parent._id)} className="px-3 py-1.5 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
