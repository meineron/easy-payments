import { useState } from "react";
import { Provider } from "react-redux";
import { makeStore } from "./index";

/**
 * Per-request Redux store. We initialize via `useState` so the store is stable
 * across re-renders but never shared between users on the server.
 */
export default function StoreProvider({ children }) {
  const [store] = useState(() => makeStore());
  return <Provider store={store}>{children}</Provider>;
}
