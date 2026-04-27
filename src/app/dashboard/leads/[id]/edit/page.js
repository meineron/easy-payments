import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/router";
import { useIntl } from "react-intl";
import RichTextEditor from "@/components/RichTextEditor";

const FIELD_TYPES = [
  { value: "input", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "dropdown_single", label: "Dropdown (single)" },
  { value: "dropdown_multi", label: "Dropdown (multi)" },
  { value: "radio", label: "Radio" },
  { value: "multichoice_checkbox", label: "Checkbox group" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "address", label: "Address" },
  { value: "date", label: "Date" },
  { value: "title_description", label: "Title / Description" },
];

const CHOICE_TYPES = ["multichoice_checkbox", "radio", "dropdown_single", "dropdown_multi"];

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "success" ? "bg-green-600" : "bg-red-600";
  return (
    <div className={`fixed top-4 end-4 z-[100] ${bg} text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium`}>
      {message}
    </div>
  );
}

export default function EditLeadPage() {
  const intl = useIntl();
  const { id } = use(params);
  const router = useRouter();
  const t = (id, values) => intl.formatMessage({ id: `payments.leads.${id}` }, values);
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("details");

  const loadLead = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}`);
      const d = await res.json();
      if (d.lead) setLead(d.lead);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => { loadLead(); }, [loadLead]);

  async function saveTab(payload) {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.lead) {
        setLead(d.lead);
        setToast({ type: "success", message: t("saved") });
      } else {
        setToast({ type: "error", message: d.error || t("saveFailed") });
      }
    } catch {
      setToast({ type: "error", message: t("saveFailed") });
    }
    setSaving(false);
  }

  if (loading) return <p className="text-gray-500 py-8 text-center">{tc("loading")}</p>;
  if (!lead) return <p className="text-red-500 py-8 text-center">{tc("notFound") || "Not found"}</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push(`/dashboard/leads/${id}`)}
          className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-gray-900 truncate">{lead.title || t("newLead")}</h2>
      </div>

      <div className="flex border-b mb-6 overflow-x-auto">
        {[
          { id: "details", label: t("tabDetails") },
          { id: "form", label: t("tabForm") },
          { id: "notifications", label: t("tabNotifications") },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "details" && (
        <TabDetails lead={lead} saving={saving} onSave={saveTab} t={t} tc={tc} />
      )}
      {activeTab === "form" && (
        <TabForm lead={lead} saving={saving} onSave={saveTab} t={t} tc={tc} />
      )}
      {activeTab === "notifications" && (
        <TabNotifications lead={lead} saving={saving} onSave={saveTab} t={t} tc={tc} />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ========== Details Tab ========== */
function TabDetails({ lead, saving, onSave, t, tc }) {
  const editorRef = useRef(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    coverImage: "",
    expiresAt: "",
    status: "enabled",
  });

  useEffect(() => {
    if (lead) {
      setForm({
        title: lead.title || "",
        description: lead.description || "",
        coverImage: lead.coverImage || "",
        expiresAt: lead.expiresAt ? new Date(lead.expiresAt).toISOString().slice(0, 10) : "",
        status: lead.status || "enabled",
      });
    }
  }, [lead]);

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image too large (max 2MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((p) => ({ ...p, coverImage: reader.result }));
    reader.readAsDataURL(file);
  }

  function save() {
    const html = editorRef.current?.getHtml() || form.description;
    onSave({
      title: form.title.trim(),
      description: html,
      coverImage: form.coverImage,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      status: form.status,
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("titleLabel")}</label>
        <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("coverImage")}</label>
        {form.coverImage && (
          <div className="mb-2 flex items-start gap-3">
            <img src={form.coverImage} alt="Cover" className="w-48 h-28 object-cover rounded-lg border" />
            <button onClick={() => setForm((p) => ({ ...p, coverImage: "" }))}
              className="text-xs text-red-600 hover:text-red-800">{tc("remove") || "Remove"}</button>
          </div>
        )}
        <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("descriptionLabel")}</label>
        <RichTextEditor
          ref={editorRef}
          value={form.description}
          onChange={(v) => setForm((p) => ({ ...p, description: v }))}
          minHeight={200}
          maxHeight={400}
        />
        <p className="text-xs text-gray-400 mt-1">{t("descriptionHint")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("expiryLabel")}</label>
          <input type="date" value={form.expiresAt}
            onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tc("status")}</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="enabled">{t("statusEnabled")}</option>
            <option value="disabled">{t("statusDisabled")}</option>
          </select>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {saving ? tc("saving") : t("saveDetails")}
      </button>
    </div>
  );
}

/* ========== Form Questions Tab ========== */
function TabForm({ lead, saving, onSave, t, tc }) {
  const [sections, setSections] = useState([]);
  const [editing, setEditing] = useState(null);
  const [fieldForm, setFieldForm] = useState({ key: "", type: "input", label: "", description: "", required: false, hidden: false, options: [] });
  const [newOption, setNewOption] = useState("");
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    if (lead?.formSections) setSections(JSON.parse(JSON.stringify(lead.formSections)));
  }, [lead]);

  function toggleCollapse(i) { setCollapsed((p) => ({ ...p, [i]: !p[i] })); }

  function addSection() {
    const title = prompt(t("sectionTitle"));
    if (!title?.trim()) return;
    setSections((prev) => [
      ...prev,
      { key: `custom_${Date.now()}`, title: title.trim(), order: prev.length, isDefault: false, fields: [] },
    ]);
  }

  function removeSection(sIdx) {
    if (sections[sIdx].isDefault) return;
    if (!confirm(t("removeSection"))) return;
    setSections((prev) => prev.filter((_, i) => i !== sIdx));
  }

  function openField(sIdx, fIdx) {
    if (fIdx !== null) {
      const f = sections[sIdx].fields[fIdx];
      setFieldForm({
        key: f.key, type: f.type, label: f.label || "", description: f.description || "",
        required: !!f.required, hidden: !!f.hidden, options: [...(f.options || [])],
      });
    } else {
      setFieldForm({ key: `field_${Date.now()}`, type: "input", label: "", description: "", required: false, hidden: false, options: [] });
    }
    setEditing({ sIdx, fIdx });
    setNewOption("");
  }

  function saveField() {
    if (!editing) return;
    const { sIdx, fIdx } = editing;
    setSections((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      const field = {
        ...fieldForm,
        isDefault: fIdx !== null ? ns[sIdx].fields[fIdx].isDefault : false,
        isMust: fIdx !== null ? ns[sIdx].fields[fIdx].isMust : false,
        order: fIdx !== null ? ns[sIdx].fields[fIdx].order : ns[sIdx].fields.length,
      };
      if (field.isMust) { field.required = true; field.hidden = false; }
      if (fIdx !== null) ns[sIdx].fields[fIdx] = field;
      else ns[sIdx].fields.push(field);
      return ns;
    });
    setEditing(null);
  }

  function removeField(sIdx, fIdx) {
    if (sections[sIdx].fields[fIdx].isMust) return;
    setSections((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      ns[sIdx].fields.splice(fIdx, 1);
      return ns;
    });
  }

  function moveField(sIdx, fIdx, dir) {
    const newIdx = fIdx + dir;
    if (newIdx < 0 || newIdx >= sections[sIdx].fields.length) return;
    setSections((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      const arr = ns[sIdx].fields;
      [arr[fIdx], arr[newIdx]] = [arr[newIdx], arr[fIdx]];
      arr.forEach((f, i) => { f.order = i; });
      return ns;
    });
  }

  function toggleRequired(sIdx, fIdx) {
    if (sections[sIdx].fields[fIdx].isMust) return;
    setSections((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      ns[sIdx].fields[fIdx].required = !ns[sIdx].fields[fIdx].required;
      return ns;
    });
  }

  function toggleHidden(sIdx, fIdx) {
    if (sections[sIdx].fields[fIdx].isMust) return;
    setSections((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      ns[sIdx].fields[fIdx].hidden = !ns[sIdx].fields[fIdx].hidden;
      return ns;
    });
  }

  function addOption() {
    if (!newOption.trim()) return;
    setFieldForm((p) => ({ ...p, options: [...p.options, newOption.trim()] }));
    setNewOption("");
  }

  function removeOption(i) {
    setFieldForm((p) => ({ ...p, options: p.options.filter((_, idx) => idx !== i) }));
  }

  function save() {
    sections.forEach((s, i) => { s.order = i; });
    onSave({ formSections: sections });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">{t("formHint")}</p>

      {sections.map((section, sIdx) => (
        <div key={section.key} className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-t-lg cursor-pointer"
            onClick={() => toggleCollapse(sIdx)}>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">{collapsed[sIdx] ? "▶" : "▼"}</span>
              <h3 className="font-semibold text-gray-900">{section.title}</h3>
              {section.isDefault && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{t("default")}</span>}
              <span className="text-xs text-gray-400">({section.fields.length} {t("fields")})</span>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => openField(sIdx, null)}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">
                {t("addField")}
              </button>
              {!section.isDefault && (
                <button onClick={() => removeSection(sIdx)}
                  className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">
                  {tc("remove") || "Remove"}
                </button>
              )}
            </div>
          </div>
          {!collapsed[sIdx] && (
            <div className="p-4">
              {section.fields.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">{t("noFieldsYet")}</p>
              ) : (
                <div className="space-y-2">
                  {section.fields.map((field, fIdx) => (
                    <div key={field.key}
                      className={`flex items-center gap-3 px-3 py-2 rounded border text-sm ${field.hidden ? "bg-gray-50 opacity-60" : ""}`}>
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveField(sIdx, fIdx, -1)} disabled={fIdx === 0}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">▲</button>
                        <button onClick={() => moveField(sIdx, fIdx, 1)} disabled={fIdx === section.fields.length - 1}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">▼</button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium" dangerouslySetInnerHTML={{ __html: field.label || "(no label)" }} />
                        <span className="text-xs text-gray-400 ms-2">{field.type}</span>
                        {field.isMust && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded ms-2" title={t("mustFieldLocked")}>Must</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleRequired(sIdx, fIdx)} disabled={field.isMust}
                          className={`text-xs px-2 py-0.5 rounded ${
                            field.required ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          } ${field.isMust ? "cursor-not-allowed" : ""}`}>
                          {field.required ? tc("required") : tc("optional")}
                        </button>
                        {!field.isMust && (
                          <button onClick={() => toggleHidden(sIdx, fIdx)}
                            className={`text-xs px-2 py-0.5 rounded ${
                              field.hidden ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
                            }`}>
                            {field.hidden ? t("hidden") : tc("visible") || "Visible"}
                          </button>
                        )}
                        <button onClick={() => openField(sIdx, fIdx)}
                          className="text-xs text-blue-600 hover:text-blue-800">{tc("edit")}</button>
                        {!field.isMust && (
                          <button onClick={() => removeField(sIdx, fIdx)}
                            className="text-xs text-red-500 hover:text-red-700">×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <button onClick={addSection} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
        {t("addSection")}
      </button>

      <div>
        <button onClick={save} disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? tc("saving") : t("saveForm")}
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">
              {editing.fIdx !== null ? t("editField") : t("addField")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("fieldType")}</label>
                <select value={fieldForm.type} onChange={(e) => setFieldForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("label")}</label>
                <div contentEditable suppressContentEditableWarning
                  className="w-full border rounded-lg px-3 py-2 text-sm min-h-[38px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dangerouslySetInnerHTML={{ __html: fieldForm.label }}
                  onBlur={(e) => setFieldForm((p) => ({ ...p, label: e.target.innerHTML }))} />
                <p className="text-xs text-gray-400 mt-1">{t("labelHint")}</p>
              </div>
              {fieldForm.type !== "title_description" && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fieldForm.required}
                      onChange={(e) => setFieldForm((p) => ({ ...p, required: e.target.checked }))}
                      className="rounded" />
                    {tc("required")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fieldForm.hidden}
                      onChange={(e) => setFieldForm((p) => ({ ...p, hidden: e.target.checked }))}
                      className="rounded" />
                    {t("hidden")}
                  </label>
                </div>
              )}
              {CHOICE_TYPES.includes(fieldForm.type) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
                  <div className="space-y-1 mb-2">
                    {fieldForm.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 px-2 py-1 bg-gray-50 rounded">{opt}</span>
                        <button onClick={() => removeOption(i)} className="text-red-500 text-xs">×</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newOption} onChange={(e) => setNewOption(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addOption()}
                      placeholder="Add option"
                      className="flex-1 border rounded px-2 py-1 text-sm" />
                    <button onClick={addOption} className="text-sm text-blue-600 hover:text-blue-800">Add</button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveField}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                {editing.fIdx !== null ? t("updateField") : t("addField")}
              </button>
              <button onClick={() => setEditing(null)}
                className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
                {tc("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Notifications Tab ========== */
function TabNotifications({ lead, saving, onSave, t, tc }) {
  const [staff, setStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [selected, setSelected] = useState([]);
  const [channels, setChannels] = useState({ email: true, sms: false });

  useEffect(() => {
    fetch("/api/club-users")
      .then((r) => r.json())
      .then((d) => {
        const active = (d.users || []).filter((u) => u.status === "active" || u.status === "invited");
        setStaff(active);
      })
      .catch(() => {})
      .finally(() => setLoadingStaff(false));
  }, []);

  useEffect(() => {
    if (lead) {
      const ids = (lead.notifyStaffIds || []).map((s) => typeof s === "object" ? String(s._id) : String(s));
      setSelected(ids);
      setChannels({
        email: lead.notifyChannels?.email !== false,
        sms: lead.notifyChannels?.sms === true,
      });
    }
  }, [lead]);

  function toggle(uid) {
    setSelected((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  }

  function save() {
    onSave({
      notifyStaffIds: selected,
      notifyChannels: channels,
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{t("notifyStaffTitle")}</h3>
        <p className="text-xs text-gray-500">{t("notifyStaffHint")}</p>
      </div>

      <div className="flex items-center gap-6 bg-gray-50 rounded-lg p-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={channels.email}
            onChange={(e) => setChannels((p) => ({ ...p, email: e.target.checked }))}
            className="rounded" />
          <span className="text-sm text-gray-800">{t("notifyByEmail")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={channels.sms}
            onChange={(e) => setChannels((p) => ({ ...p, sms: e.target.checked }))}
            className="rounded" />
          <span className="text-sm text-gray-800">{t("notifyBySMS")}</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("selectStaff")}</label>
        {loadingStaff ? (
          <p className="text-sm text-gray-500">{tc("loading")}</p>
        ) : staff.length === 0 ? (
          <div className="bg-white border rounded-lg p-6 text-center text-sm text-gray-500">
            {t("noStaff")}
          </div>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {staff.map((u) => {
              const id = String(u._id);
              const isSelected = selected.includes(id);
              const noPhone = !u.phone;
              return (
                <label key={id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(id)}
                    className="rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {u.email}
                      {u.phone && <span className="ms-2" dir="ltr">· {u.phonePrefix} {u.phone}</span>}
                    </p>
                  </div>
                  {isSelected && channels.sms && noPhone && (
                    <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded">
                      {t("staffMissingPhone")}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <button onClick={save} disabled={saving}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {saving ? tc("saving") : t("saveNotifications")}
      </button>
    </div>
  );
}
