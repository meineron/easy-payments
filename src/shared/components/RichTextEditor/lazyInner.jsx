import RichTextEditor from "./index";

/**
 * Internal bridge for the dynamic editor wrapper.
 *
 * `next/dynamic` consumes the wrapper's own ref (to expose `{retry}`),
 * so user refs can't be passed through the normal `ref` prop. We accept a
 * `forwardedRef` prop instead and attach it to the real editor.
 */
export default function RichTextEditorLazyInner({ forwardedRef, ...props }) {
  return <RichTextEditor ref={forwardedRef} {...props} />;
}
