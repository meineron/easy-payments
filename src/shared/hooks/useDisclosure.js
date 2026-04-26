"use client";

import { useCallback, useState } from "react";

/**
 * Open/close state pair. Cleaner than `const [open, setOpen]` for modals.
 *   const modal = useDisclosure();
 *   modal.open();  modal.close();  modal.isOpen
 */
export function useDisclosure(initial = false) {
  const [isOpen, setIsOpen] = useState(initial);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  return { isOpen, open, close, toggle, setIsOpen };
}

export default useDisclosure;
