"use client";

import { useState, useEffect, use } from "react";
import IntlProvider from "@/components/IntlProvider";
import PhonePrefixInput from "@/components/PhonePrefixInput";
import { getMessages, getDirection } from "@/lib/i18n";
import { useTranslations } from "next-intl";

export default function PublicLeadPage({ params }) {
  const { slug } = use(params);
  const [locale, setLocale] = useState("en");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/public/leads/${slug}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, body: d })))
      .then(({ ok, body }) => {
        if (!ok) {
          setError(body.reason || "notfound");
        } else {
          setData(body);
          setLocale(body.club?.language || "en");
        }
      })
      .catch(() => setError("error"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }

  if (error || !data) {
    return (
      <IntlProvider locale="en" messages={getMessages("en")}>
        <ExpiredScreen locale="en" />
      </IntlProvider>
    );
  }

  return (
    <IntlProvider locale={locale} messages={getMessages(locale)}>
      <LeadPageContent slug={slug} lead={data.lead} club={data.club} locale={locale} />
    </IntlProvider>
  );
}

function ExpiredScreen() {
  const t = useTranslations("leads");
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="bg-white rounded-xl border p-8 text-center max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("publicExpired")}</h2>
      </div>
    </div>
  );
}

function LeadPageContent({ slug, lead, club, locale }) {
  const t = useTranslations("leads");
  const dir = getDirection(locale);

  const [responses, setResponses] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const initial = {};
    for (const section of lead.formSections || []) {
      for (const field of section.fields || []) {
        if (field.type === "phone") {
          initial[field.key] = { prefix: locale === "he" ? "+972" : "+1", number: "" };
        } else if (field.type === "multichoice_checkbox" || field.type === "dropdown_multi") {
          initial[field.key] = [];
        } else if (field.type === "address") {
          initial[field.key] = { line1: "", city: "", state: "", postal: "", country: "" };
        } else {
          initial[field.key] = "";
        }
      }
    }
    setResponses(initial);
  }, [lead, locale]);

  function setValue(key, value) {
    setResponses((p) => ({ ...p, [key]: value }));
    setErrors((p) => ({ ...p, [key]: null }));
  }

  function validate() {
    const err = {};
    for (const section of lead.formSections || []) {
      for (const field of section.fields || []) {
        if (field.hidden || field.type === "title_description") continue;
        if (!field.required && !field.isMust) continue;
        const v = responses[field.key];
        let empty = false;
        if (v === undefined || v === null || v === "") empty = true;
        else if (Array.isArray(v) && v.length === 0) empty = true;
        else if (field.type === "phone") {
          if (!v?.number || !String(v.number).trim()) empty = true;
        } else if (field.type === "address") {
          if (!v?.line1?.trim()) empty = true;
        }
        if (empty) {
          err[field.key] = t("publicRequired");
          continue;
        }
        if (field.type === "email" || field.key === "lead_email") {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) {
            err[field.key] = t("publicInvalidEmail");
          }
        }
        if (field.type === "phone") {
          const digits = String(v.number || "").replace(/\D/g, "");
          if (digits.length < 6) {
            err[field.key] = t("publicInvalidPhone");
          }
        }
      }
    }
    return err;
  }

  async function submit(e) {
    e.preventDefault();
    const err = validate();
    setErrors(err);
    if (Object.keys(err).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/leads/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses }),
      });
      const d = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else if (d.missing?.length) {
        const me = {};
        d.missing.forEach((m) => { me[m.key] = t("publicRequired"); });
        setErrors(me);
      } else {
        setErrors({ _form: d.error || t("publicError") });
      }
    } catch {
      setErrors({ _form: t("publicError") });
    }
    setSubmitting(false);
  }

  if (success) {
    return (
      <div dir={dir} className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border shadow-sm p-10 max-w-md text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-2xl">
            ✓
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t("publicSuccess")}</h2>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {club?.logoUrl && (
          <img src={club.logoUrl} alt={club.name} className="h-12 mx-auto mb-6 object-contain" />
        )}

        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {lead.coverImage && (
            <img src={lead.coverImage} alt="" className="w-full aspect-[3/1] object-cover" />
          )}

          <div className="p-6 sm:p-8 border-b">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{lead.title}</h1>
            {lead.description && (
              <div className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: lead.description }} />
            )}
          </div>

          <form onSubmit={submit} className="p-6 sm:p-8 space-y-8">
            {(lead.formSections || []).map((section) => (
              <div key={section.key} className="space-y-4">
                {section.title && !section.isDefault && (
                  <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">{section.title}</h2>
                )}
                {(section.fields || [])
                  .filter((f) => !f.hidden)
                  .map((field) => (
                    <FieldRenderer
                      key={field.key}
                      field={field}
                      value={responses[field.key]}
                      onChange={(v) => setValue(field.key, v)}
                      error={errors[field.key]}
                    />
                  ))}
              </div>
            ))}

            {errors._form && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                {errors._form}
              </div>
            )}

            <button type="submit" disabled={submitting}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {submitting ? "…" : t("publicSubmit")}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by <span className="font-semibold text-gray-500">EasyCoach.Club</span>
        </p>
      </div>
    </div>
  );
}

function FieldRenderer({ field, value, onChange, error }) {
  const label = field.label || field.key;
  const required = field.required || field.isMust;

  const Label = () => (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      <span dangerouslySetInnerHTML={{ __html: label }} />
      {required && <span className="text-red-500 ms-1">*</span>}
    </label>
  );

  const baseInput = "w-full border rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const errCls = error ? "border-red-400 bg-red-50" : "border-gray-300";

  if (field.type === "title_description") {
    return (
      <div className="bg-gray-50 border rounded-lg p-4">
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: label }} />
        {field.description && (
          <div className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: field.description }} />
        )}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        <Label />
        <textarea value={value || ""} onChange={(e) => onChange(e.target.value)}
          rows={4} className={`${baseInput} ${errCls} resize-none`} />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "email") {
    return (
      <div>
        <Label />
        <input type="email" value={value || ""} onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${errCls}`} autoComplete="email" />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "phone") {
    const v = value || { prefix: "+1", number: "" };
    return (
      <div>
        <Label />
        <PhonePrefixInput
          prefix={v.prefix}
          phone={v.number}
          onPrefixChange={(p) => onChange({ ...v, prefix: p })}
          onPhoneChange={(n) => onChange({ ...v, number: n })}
          className={error ? "ring-2 ring-red-300 rounded-lg" : ""}
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div>
        <Label />
        <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${errCls}`} />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "address") {
    const v = value || {};
    return (
      <div>
        <Label />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input placeholder="Address line" value={v.line1 || ""}
            onChange={(e) => onChange({ ...v, line1: e.target.value })}
            className={`${baseInput} ${errCls} sm:col-span-2`} />
          <input placeholder="City" value={v.city || ""}
            onChange={(e) => onChange({ ...v, city: e.target.value })}
            className={`${baseInput} border-gray-300`} />
          <input placeholder="State / Region" value={v.state || ""}
            onChange={(e) => onChange({ ...v, state: e.target.value })}
            className={`${baseInput} border-gray-300`} />
          <input placeholder="Postal code" value={v.postal || ""}
            onChange={(e) => onChange({ ...v, postal: e.target.value })}
            className={`${baseInput} border-gray-300`} />
          <input placeholder="Country" value={v.country || ""}
            onChange={(e) => onChange({ ...v, country: e.target.value })}
            className={`${baseInput} border-gray-300`} />
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "dropdown_single") {
    return (
      <div>
        <Label />
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${errCls}`}>
          <option value="">—</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "dropdown_multi") {
    const list = Array.isArray(value) ? value : [];
    return (
      <div>
        <Label />
        <select multiple value={list}
          onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
          className={`${baseInput} ${errCls}`}>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div>
        <Label />
        <div className="space-y-1">
          {(field.options || []).map((o) => (
            <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" name={field.key} value={o} checked={value === o}
                onChange={(e) => onChange(e.target.value)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "multichoice_checkbox") {
    const list = Array.isArray(value) ? value : [];
    return (
      <div>
        <Label />
        <div className="space-y-1">
          {(field.options || []).map((o) => (
            <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={list.includes(o)}
                onChange={(e) => {
                  if (e.target.checked) onChange([...list, o]);
                  else onChange(list.filter((x) => x !== o));
                }} />
              <span>{o}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <Label />
      <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} ${errCls}`} />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
