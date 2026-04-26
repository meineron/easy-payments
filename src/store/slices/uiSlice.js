"use client";

import { createSlice, nanoid } from "@reduxjs/toolkit";

/**
 * Cross-page UI state.
 *
 * Lives ONLY for things that need to survive route navigation or be read
 * by deeply nested components without prop drilling:
 *   - toast queue (shown by <Toast />)
 *   - modal stack (optional helper for shared/components/Modal)
 *
 * Do NOT put server data here — that belongs in RTK Query.
 * Do NOT put filters/tabs/pagination here — those belong in URL search params.
 * Do NOT put transient form state here — that belongs in local useState.
 */
const initialState = {
  toasts: [],
  modalStack: [],
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    pushToast: {
      reducer(state, action) {
        state.toasts.push(action.payload);
      },
      prepare({ message, type = "success", durationMs = 3000 }) {
        return {
          payload: {
            id: nanoid(),
            message,
            type,
            durationMs,
          },
        };
      },
    },
    dismissToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    clearToasts(state) {
      state.toasts = [];
    },

    openModal: {
      reducer(state, action) {
        state.modalStack.push(action.payload);
      },
      prepare({ name, props = {} }) {
        return { payload: { id: nanoid(), name, props } };
      },
    },
    closeModal(state, action) {
      const id = action.payload;
      state.modalStack = id
        ? state.modalStack.filter((m) => m.id !== id)
        : state.modalStack.slice(0, -1);
    },
    closeAllModals(state) {
      state.modalStack = [];
    },
  },
});

export const {
  pushToast,
  dismissToast,
  clearToasts,
  openModal,
  closeModal,
  closeAllModals,
} = uiSlice.actions;

export const selectToasts = (state) => state.ui.toasts;
export const selectModalStack = (state) => state.ui.modalStack;
export const selectTopModal = (state) =>
  state.ui.modalStack[state.ui.modalStack.length - 1] ?? null;

export default uiSlice.reducer;
