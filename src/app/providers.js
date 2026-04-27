import StoreProvider from "@/store/StoreProvider";
import Toast from "@/shared/components/Toast";

/**
 * Root providers — kept lightweight and global.
 *
 * Things that depend on the user's locale or session (next-intl, next-auth)
 * are wired per-segment (e.g. `app/dashboard/layout.js`) since they need data
 * fetched after auth resolves. Redux is global because RTK Query is used by
 * every authed segment.
 */
export default function Providers({ children }) {
  return (
    <StoreProvider>
      {children}
      <Toast />
    </StoreProvider>
  );
}
