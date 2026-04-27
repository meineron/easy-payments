import { useRef } from "react";
import { useIntl } from "react-intl";

const VARIABLE_TOKENS = [
  { key: "player_name", labelKey: "insertPlayerName" },
  { key: "activity_name", labelKey: "insertActivityName" },
  { key: "team_name", labelKey: "insertTeamName" },
  { key: "club_name", labelKey: "insertClubName" },
];

export default function InvitationTemplateEditor({
  subject,
  bodyHtml,
  smsText,
  onSubjectChange,
  onBodyChange,
  onSmsChange,
  onReset,
  showPersonalLink = true,
  showCoverImageToken = true,
  showSms = true,
  showSubject = true,
  personalLinkToken = "{personal_registration_link}",
  personalLinkButtonLabel,
  personalLinkButtonColor = "#2563eb",
}) {
  const intl = useIntl();
  const td = (id, values) => intl.formatMessage({ id: `payments.activityDetail.${id}` }, values);
  const te = (id, values) => intl.formatMessage({ id: `payments.email.${id}` }, values);
  const bodyRef = useRef(null);
  const smsRef = useRef(null);
  const imgInputRef = useRef(null);

  function execCmd(cmd, val = null) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
    if (bodyRef.current) onBodyChange(bodyRef.current.innerHTML);
  }

  function insertHtml(html) {
    bodyRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    if (bodyRef.current) onBodyChange(bodyRef.current.innerHTML);
  }

  function insertLink() {
    const url = prompt(td("enterUrl"));
    if (url) execCmd("createLink", url);
  }

  function insertIntoBody(text) {
    bodyRef.current?.focus();
    document.execCommand("insertText", false, text);
    if (bodyRef.current) onBodyChange(bodyRef.current.innerHTML);
  }

  function insertPersonalLinkButton() {
    const label = personalLinkButtonLabel || te("regLinkButton");
    const html =
      `<div style="text-align:center;margin:16px 0;">` +
      `<a href="${personalLinkToken}" style="display:inline-block;background:${personalLinkButtonColor};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${label}</a>` +
      `</div><p><br/></p>`;
    insertHtml(html);
  }

  function insertCoverImageToken() {
    bodyRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<img src="{cover_image}" alt="" style="max-width:100%;width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;" /><p><br/></p>',
    );
    if (bodyRef.current) onBodyChange(bodyRef.current.innerHTML);
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      bodyRef.current?.focus();
      document.execCommand("insertImage", false, reader.result);
      const imgs = bodyRef.current?.querySelectorAll("img");
      if (imgs) imgs.forEach((img) => {
        img.style.maxWidth = "100%";
        img.style.width = "100%";
        img.style.height = "auto";
        img.style.display = "block";
        img.style.borderRadius = "8px";
        img.style.margin = "8px 0";
      });
      if (bodyRef.current) onBodyChange(bodyRef.current.innerHTML);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function insertIntoSms(token) {
    const el = smsRef.current;
    if (!el) { onSmsChange((smsText || "") + token); return; }
    const start = el.selectionStart ?? smsText.length;
    const end = el.selectionEnd ?? smsText.length;
    const next = (smsText || "").slice(0, start) + token + (smsText || "").slice(end);
    onSmsChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="space-y-4">
      {/* Variables hint */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <p>{td.raw("templateVariablesHint")}</p>
      </div>

      {showSubject && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            {td("registrationInvitationSubject")}
          </label>
          <input
            value={subject || ""}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          {td("registrationInvitationBody")}
        </label>

        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b flex-wrap">
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }} className="px-2 py-1 rounded text-sm font-bold hover:bg-gray-200">{td("bold")}</button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }} className="px-2 py-1 rounded text-sm italic hover:bg-gray-200">{td("italic")}</button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }} className="px-2 py-1 rounded text-sm underline hover:bg-gray-200">{td("underline")}</button>
            <div className="w-px h-5 bg-gray-300 mx-1" />
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertUnorderedList"); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200">{td("bulletList")}</button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertOrderedList"); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200">{td("numberedList")}</button>
            <div className="w-px h-5 bg-gray-300 mx-1" />
            <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-blue-600">{td("link")}</button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); imgInputRef.current?.click(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200">{td("image")}</button>
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <div className="w-px h-5 bg-gray-300 mx-1" />
            {showPersonalLink && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertPersonalLinkButton(); }}
                className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-purple-600 font-medium"
                title={personalLinkToken}
              >
                {td("insertPersonalLink")}
              </button>
            )}
            {showCoverImageToken && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertCoverImageToken(); }}
                className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-emerald-600 font-medium"
                title="{cover_image}"
              >
                {td("insertCoverImage")}
              </button>
            )}
            {VARIABLE_TOKENS.map((v) => (
              <button
                key={v.key}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertIntoBody(`{${v.key}}`); }}
                className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-indigo-600"
                title={`{${v.key}}`}
              >
                {td(v.labelKey)}
              </button>
            ))}
          </div>
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={() => { if (bodyRef.current) onBodyChange(bodyRef.current.innerHTML); }}
            className="px-3 py-2 text-sm min-h-[200px] focus:outline-none prose prose-sm max-w-none"
            style={{ overflowY: "auto", maxHeight: "400px" }}
            dangerouslySetInnerHTML={{ __html: bodyHtml || "" }}
          />
        </div>
      </div>

      {showSms && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            {td("registrationInvitationSms")}
          </label>
          <div className="flex items-center gap-1 flex-wrap mb-1">
            <button
              type="button"
              onClick={() => insertIntoSms("{link}")}
              className="px-2 py-0.5 rounded text-xs hover:bg-gray-200 text-purple-600 border border-purple-200 bg-purple-50"
            >
              {"{link}"}
            </button>
            {VARIABLE_TOKENS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertIntoSms(`{${v.key}}`)}
                className="px-2 py-0.5 rounded text-xs hover:bg-gray-200 text-indigo-600 border border-indigo-200 bg-indigo-50"
              >
                {td(v.labelKey)}
              </button>
            ))}
          </div>
          <textarea
            ref={smsRef}
            value={smsText || ""}
            onChange={(e) => onSmsChange(e.target.value)}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">{(smsText || "").length} characters</p>
        </div>
      )}

      {onReset && (
        <div>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {td("resetToDefault")}
          </button>
        </div>
      )}
    </div>
  );
}
