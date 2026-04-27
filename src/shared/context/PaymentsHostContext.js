import { createContext, useContext, useMemo } from "react";

/**
 * Injected by the host app at the PaymentsHostBoundary level.
 *
 * Standalone Next.js (pages/_app.js) supplies the Next.js router.
 * pl-football-web (EasyPaymentsV2/PaymentsHostBoundary) supplies react-router.
 *
 * Shape:
 *   router: {
 *     pathname: string,
 *     searchParams: URLSearchParams,
 *     navigate: (url: string, opts?: { replace?: boolean }) => void,
 *     Link: React.ComponentType<{ href: string, children: ReactNode, [key]: any }>,
 *   }
 */
const PaymentsHostContext = createContext(null);

export function PaymentsHostProvider({ router, children }) {
  return (
    <PaymentsHostContext.Provider value={router}>
      {children}
    </PaymentsHostContext.Provider>
  );
}

export function usePaymentsRouter() {
  const ctx = useContext(PaymentsHostContext);
  if (!ctx) {
    throw new Error(
      "usePaymentsRouter must be called inside a PaymentsHostProvider. " +
      "Wrap your app in PaymentsHostBoundary (pl-football-web) or _app.js (standalone)."
    );
  }
  return ctx;
}

export function usePaymentsLink() {
  return usePaymentsRouter().Link;
}

export default PaymentsHostContext;
