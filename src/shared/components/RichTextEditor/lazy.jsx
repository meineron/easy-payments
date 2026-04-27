import { forwardRef } from "react";
import dynamic from "next/dynamic";

/**
 * Lazy-loaded RichTextEditor.
 *
 * The editor pulls in a sizeable WYSIWYG surface and uses DOM-only APIs
 * (`document.execCommand`, contentEditable, selection ranges) so we render
 * it client-only and split it into its own chunk that loads on demand.
 *
 * Use this module from any feature/page that needs the editor:
 *
 *   import RichTextEditor from "@/shared/components/RichTextEditor/lazy";
 *
 * The imperative ref API (`getHtml`, `setHtml`, `focus`, `clear`) is
 * preserved through a small bridge in `./lazyInner`.
 */
const DynamicInner = dynamic(() => import("./lazyInner"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full rounded-lg border border-gray-200 bg-gray-50 animate-pulse"
      style={{ minHeight: 200 }}
      aria-busy="true"
    />
  ),
});

const RichTextEditorLazy = forwardRef(function RichTextEditorLazy(props, ref) {
  return <DynamicInner {...props} forwardedRef={ref} />;
});

export default RichTextEditorLazy;
