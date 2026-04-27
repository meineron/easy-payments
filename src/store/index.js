import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "./services/api";
import uiReducer from "./slices/uiSlice";

export function makeStore() {
  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      ui: uiReducer,
    },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

  setupListeners(store.dispatch);
  return store;
}
