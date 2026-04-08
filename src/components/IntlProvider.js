"use client";

import { NextIntlClientProvider } from "next-intl";

export default function IntlProvider({ locale, messages, children }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
