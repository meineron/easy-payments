"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Generic rich-text (WYSIWYG) editor.
 *
 * Props:
 *   value        (string)  - current HTML
 *   onChange     (fn)      - called with new HTML on input/blur
 *   placeholder  (string)  - shown when editor empty
 *   minHeight    (number)  - min height in px (default 200)
 *   maxHeight    (number)  - max height in px before scroll (default 500)
 *   initialDir   ("ltr"|"rtl") - default direction of editor body
 *   compact      (boolean) - smaller toolbar/padding (modal mode)
 *
 * Imperative ref API:
 *   getHtml()    - returns current innerHTML
 *   setHtml(h)   - replaces content
 *   focus()      - focuses the editor
 *   clear()      - empties the editor
 */
const RichTextEditor = forwardRef(function RichTextEditor(
  {
    value = "",
    onChange,
    placeholder = "",
    minHeight = 200,
    maxHeight = 500,
    initialDir = "ltr",
    compact = false,
  },
  ref
) {
  const t = useTranslations("richTextEditor");
  const tc = useTranslations("common");

  const bodyRef = useRef(null);
  const imgInputRef = useRef(null);
  const savedRange = useRef(null);
  const lastEmittedRef = useRef(value || "");

  const [activeFormats, setActiveFormats] = useState({});
  const [selectedImg, setSelectedImg] = useState(null);
  const [dir, setDir] = useState(initialDir === "rtl" ? "rtl" : "ltr");

  const [btnModal, setBtnModal] = useState(false);
  const [btnText, setBtnText] = useState("Click Here");
  const [btnUrl, setBtnUrl] = useState("");
  const [btnColor, setBtnColor] = useState("#2563eb");

  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const emit = useCallback(
    (html) => {
      lastEmittedRef.current = html;
      if (onChange) onChange(html);
    },
    [onChange]
  );

  useEffect(() => {
    if (!bodyRef.current) return;
    const incoming = value || "";
    if (incoming !== lastEmittedRef.current) {
      bodyRef.current.innerHTML = incoming;
      lastEmittedRef.current = incoming;
    }
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => bodyRef.current?.innerHTML || "",
      setHtml: (html) => {
        if (bodyRef.current) {
          bodyRef.current.innerHTML = html || "";
          lastEmittedRef.current = html || "";
          emit(html || "");
        }
      },
      focus: () => bodyRef.current?.focus(),
      clear: () => {
        if (bodyRef.current) {
          bodyRef.current.innerHTML = "";
          lastEmittedRef.current = "";
          emit("");
        }
      },
    }),
    [emit]
  );

  function checkFormats() {
    try {
      setActiveFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    } catch {}
  }

  useEffect(() => {
    function onSelChange() {
      const sel = window.getSelection();
      if (sel?.rangeCount && bodyRef.current?.contains(sel.anchorNode)) checkFormats();
    }
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  function execCmd(cmd, val = null) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
    checkFormats();
    if (bodyRef.current) emit(bodyRef.current.innerHTML);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    if (savedRange.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  function insertLink() {
    const url = prompt(t("enterUrl"));
    if (url) execCmd("createLink", url);
  }

  function openBtnModal() {
    saveSelection();
    setBtnText(t("defaultButtonText"));
    setBtnUrl("");
    setBtnColor("#2563eb");
    setBtnModal(true);
  }

  function appendHtmlAndFocusEnd(html) {
    const currentHtml = bodyRef.current?.innerHTML || "";
    if (bodyRef.current) {
      bodyRef.current.innerHTML = currentHtml + html;
      emit(bodyRef.current.innerHTML);
    }
    setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(bodyRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 30);
  }

  function insertButton() {
    if (!btnUrl.trim()) return;
    const color = btnColor;
    const text = btnText || t("defaultButtonText");
    const url = btnUrl;
    const html = `<div style="text-align:center;margin:16px 0;"><a href="${url}" class="email-button" style="display:inline-block;padding:12px 28px;border-radius:8px;color:#fff;text-decoration:none;font-weight:600;font-size:16px;background:${color};">${text}</a></div><p><br></p>`;
    setBtnModal(false);
    appendHtmlAndFocusEnd(html);
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const html = `<div style="margin:8px 0;"><img src="${reader.result}" data-init="1" style="max-width:100%;width:100%;height:auto;display:block;border-radius:8px;" /></div><p><br></p>`;
      appendHtmlAndFocusEnd(html);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleEditorClick(e) {
    if (bodyRef.current)
      bodyRef.current
        .querySelectorAll("img.img-selected")
        .forEach((i) => i.classList.remove("img-selected"));
    if (e.target.tagName === "IMG") {
      e.target.classList.add("img-selected");
      setSelectedImg(e.target);
    } else {
      setSelectedImg(null);
    }
  }

  function setImgSize(width) {
    if (!selectedImg) return;
    selectedImg.style.width = width;
    selectedImg.style.maxWidth = "100%";
    selectedImg.style.height = "auto";
    if (bodyRef.current) emit(bodyRef.current.innerHTML);
  }

  function setImgLink(url) {
    if (!selectedImg) return;
    const parent = selectedImg.parentElement;
    if (url) {
      if (parent?.tagName === "A") {
        parent.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        selectedImg.parentNode.insertBefore(a, selectedImg);
        a.appendChild(selectedImg);
      }
    } else if (parent?.tagName === "A") {
      parent.parentNode.insertBefore(selectedImg, parent);
      parent.remove();
    }
    if (bodyRef.current) emit(bodyRef.current.innerHTML);
  }

  function getImgLink() {
    if (!selectedImg) return "";
    const parent = selectedImg.parentElement;
    return parent?.tagName === "A" ? parent.href : "";
  }

  function setImgAlign(align) {
    if (!selectedImg) return;
    const wrapper = selectedImg.parentElement;
    if (align === "center") {
      selectedImg.style.marginLeft = "auto";
      selectedImg.style.marginRight = "auto";
      if (wrapper?.style) wrapper.style.textAlign = "center";
    } else if (align === "left") {
      selectedImg.style.marginLeft = "0";
      selectedImg.style.marginRight = "auto";
      if (wrapper?.style) wrapper.style.textAlign = "left";
    } else {
      selectedImg.style.marginLeft = "auto";
      selectedImg.style.marginRight = "0";
      if (wrapper?.style) wrapper.style.textAlign = "right";
    }
    if (bodyRef.current) emit(bodyRef.current.innerHTML);
  }

  function applyFontSize(size) {
    bodyRef.current?.focus();
    document.execCommand("fontSize", false, "7");
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const span = sel.anchorNode?.parentElement;
      if (span?.style) span.style.fontSize = size;
    }
    if (bodyRef.current) emit(bodyRef.current.innerHTML);
  }

  function applyColor(color) {
    bodyRef.current?.focus();
    restoreSelection();
    document.execCommand("foreColor", false, color);
    if (bodyRef.current) emit(bodyRef.current.innerHTML);
  }

  function toggleDir() {
    const next = dir === "rtl" ? "ltr" : "rtl";
    setDir(next);
    if (bodyRef.current) {
      bodyRef.current.dir = next;
      emit(bodyRef.current.innerHTML);
    }
  }

  const COLOR_SWATCHES = [
    "#111827",
    "#dc2626",
    "#ea580c",
    "#ca8a04",
    "#16a34a",
    "#0d9488",
    "#2563eb",
    "#9333ea",
    "#db2777",
    "#6b7280",
    "#ffffff",
  ];
  const BUTTON_COLOR_SWATCHES = [
    "#2563eb",
    "#16a34a",
    "#dc2626",
    "#9333ea",
    "#ea580c",
    "#0d9488",
    "#111827",
  ];

  const btnCls = compact ? "px-1.5 py-1 text-sm" : "px-2 py-1 text-sm";
  const bodyPad = compact ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* ===== TOOLBAR ===== */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b flex-wrap">
        {/* Text format */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd("bold");
          }}
          className={`${btnCls} rounded font-bold transition ${
            activeFormats.bold ? "bg-blue-600 text-white" : "hover:bg-gray-200"
          }`}
          title={t("bold")}
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd("italic");
          }}
          className={`${btnCls} rounded italic transition ${
            activeFormats.italic ? "bg-blue-600 text-white" : "hover:bg-gray-200"
          }`}
          title={t("italic")}
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd("underline");
          }}
          className={`${btnCls} rounded underline transition ${
            activeFormats.underline ? "bg-blue-600 text-white" : "hover:bg-gray-200"
          }`}
          title={t("underline")}
        >
          U
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Lists */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd("insertUnorderedList");
          }}
          className={`${btnCls} rounded hover:bg-gray-200`}
          title={t("bulletList")}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="3" cy="5" r="1.5" />
            <circle cx="3" cy="10" r="1.5" />
            <circle cx="3" cy="15" r="1.5" />
            <rect x="7" y="4" width="11" height="2" rx="1" />
            <rect x="7" y="9" width="11" height="2" rx="1" />
            <rect x="7" y="14" width="11" height="2" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd("insertOrderedList");
          }}
          className={`${btnCls} rounded hover:bg-gray-200`}
          title={t("numberedList")}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <text x="1" y="7" fontSize="6" fontWeight="bold">1</text>
            <text x="1" y="12" fontSize="6" fontWeight="bold">2</text>
            <text x="1" y="17" fontSize="6" fontWeight="bold">3</text>
            <rect x="7" y="4" width="11" height="2" rx="1" />
            <rect x="7" y="9" width="11" height="2" rx="1" />
            <rect x="7" y="14" width="11" height="2" rx="1" />
          </svg>
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Alignment */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd("justifyLeft");
          }}
          className={`${btnCls} rounded hover:bg-gray-200`}
          title={t("alignLeft")}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M3 6h18M3 12h12M3 18h16" />
          </svg>
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd("justifyCenter");
          }}
          className={`${btnCls} rounded hover:bg-gray-200`}
          title={t("alignCenter")}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M3 6h18M6 12h12M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd("justifyRight");
          }}
          className={`${btnCls} rounded hover:bg-gray-200`}
          title={t("alignRight")}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M3 6h18M9 12h12M5 18h16" />
          </svg>
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Link / Image / Button */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            insertLink();
          }}
          className={`${btnCls} rounded hover:bg-gray-200 text-blue-600`}
          title={t("link")}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            imgInputRef.current?.click();
          }}
          className={`${btnCls} rounded hover:bg-gray-200`}
          title={t("image")}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
        </button>
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />
        <button
          type="button"
          onClick={openBtnModal}
          className={`${btnCls} rounded hover:bg-gray-200 text-green-600 font-medium flex items-center gap-1`}
          title={t("buttonLink")}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="7" width="18" height="10" rx="3" />
            <path d="M8 12h8" />
          </svg>
          <span className="hidden sm:inline">{t("buttonLink")}</span>
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Text color */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              setColorPickerOpen((v) => !v);
            }}
            className={`${btnCls} rounded hover:bg-gray-200 flex items-center gap-1`}
            title={t("textColor")}
          >
            <span className="font-bold text-sm">A</span>
            <span className="w-3 h-3 rounded-sm border border-gray-300 bg-gradient-to-r from-red-500 via-green-500 to-blue-500" />
          </button>
          {colorPickerOpen && (
            <>
              <div
                className="fixed inset-0 z-[60]"
                onClick={() => setColorPickerOpen(false)}
              />
              <div className="absolute top-full end-0 mt-1 z-[61] bg-white border rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      applyColor(c);
                      setColorPickerOpen(false);
                    }}
                    className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
                <label className="w-6 h-6 rounded border border-gray-200 cursor-pointer flex items-center justify-center overflow-hidden">
                  <input
                    type="color"
                    onChange={(e) => {
                      applyColor(e.target.value);
                      setColorPickerOpen(false);
                    }}
                    className="w-8 h-8 cursor-pointer -m-1"
                    title={t("customColor")}
                  />
                </label>
              </div>
            </>
          )}
        </div>

        {/* Font size */}
        <select
          onChange={(e) => {
            if (e.target.value) applyFontSize(e.target.value);
            e.target.value = "";
          }}
          className="text-xs border-0 bg-transparent py-1 pr-1 text-gray-600 cursor-pointer hover:bg-gray-200 rounded"
          defaultValue=""
        >
          <option value="" disabled>
            {t("size")}
          </option>
          <option value="12px">{t("small")}</option>
          <option value="16px">{t("normal")}</option>
          <option value="20px">{t("large")}</option>
          <option value="24px">{t("xl")}</option>
        </select>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* RTL/LTR toggle */}
        <button
          type="button"
          onClick={toggleDir}
          className={`${btnCls} rounded hover:bg-gray-200 font-semibold text-xs uppercase tracking-wide`}
          title={t("direction")}
        >
          {dir === "rtl" ? t("rtl") : t("ltr")}
        </button>
      </div>

      {/* ===== IMAGE SETTINGS BAR ===== */}
      {selectedImg && (
        <div className="px-3 py-1.5 bg-blue-50 border-b text-xs space-y-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-blue-700 font-medium mr-2">{t("imageSettings")}:</span>
            <span className="text-gray-500">{t("imgSize")}:</span>
            {["25%", "50%", "75%", "100%"].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setImgSize(w)}
                className="px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-100 text-blue-700"
              >
                {w}
              </button>
            ))}
            <div className="w-px h-4 bg-blue-200 mx-1" />
            <span className="text-gray-500">{t("imgAlign")}:</span>
            <button
              type="button"
              onClick={() => setImgAlign("left")}
              className="px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
            >
              <svg
                className="w-3.5 h-3.5 text-blue-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M3 6h18M3 12h12M3 18h16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setImgAlign("center")}
              className="px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
            >
              <svg
                className="w-3.5 h-3.5 text-blue-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M3 6h18M6 12h12M4 18h16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setImgAlign("right")}
              className="px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
            >
              <svg
                className="w-3.5 h-3.5 text-blue-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M3 6h18M9 12h12M5 18h16" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-blue-600 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <input
              type="url"
              placeholder={t("imgLinkPlaceholder")}
              defaultValue={getImgLink()}
              key={selectedImg?.src}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setImgLink(e.target.value.trim());
                }
              }}
              onBlur={(e) => setImgLink(e.target.value.trim())}
              className="flex-1 min-w-0 border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
            {getImgLink() && (
              <button
                type="button"
                onClick={() => setImgLink("")}
                className="px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50 text-red-500 text-xs"
              >
                {t("removeLink")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== EDITOR BODY ===== */}
      <div
        ref={bodyRef}
        contentEditable
        suppressContentEditableWarning
        dir={dir}
        data-placeholder={placeholder}
        onClick={handleEditorClick}
        onInput={() => {
          if (bodyRef.current) emit(bodyRef.current.innerHTML);
        }}
        onBlur={() => {
          if (bodyRef.current) emit(bodyRef.current.innerHTML);
        }}
        className={`${bodyPad} text-sm focus:outline-none rte-body`}
        style={{ minHeight, maxHeight, overflowY: "auto" }}
      />

      <style jsx>{`
        .rte-body:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>

      {/* ===== BUTTON INSERT MODAL ===== */}
      {btnModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
          onClick={() => setBtnModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-bold text-gray-900">{t("insertButton")}</h4>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("btnText")}</label>
              <input
                type="text"
                value={btnText}
                onChange={(e) => setBtnText(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("btnUrl")}</label>
              <input
                type="url"
                value={btnUrl}
                onChange={(e) => setBtnUrl(e.target.value)}
                placeholder="https://..."
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("btnColor")}</label>
              <div className="flex items-center gap-2">
                {BUTTON_COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBtnColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition ${
                      btnColor === c ? "border-gray-900 scale-110" : "border-transparent"
                    }`}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="color"
                  value={btnColor}
                  onChange={(e) => setBtnColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                  title={t("customColor")}
                />
              </div>
            </div>
            <div className="pt-1">
              <div className="text-xs text-gray-400 mb-2">{t("preview")}:</div>
              <div className="text-center">
                <span
                  style={{
                    display: "inline-block",
                    padding: "12px 28px",
                    borderRadius: "8px",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "16px",
                    background: btnColor,
                  }}
                >
                  {btnText || t("defaultButtonText")}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setBtnModal(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={insertButton}
                disabled={!btnUrl.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {t("insertBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default RichTextEditor;
