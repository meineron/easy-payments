import "../styles/globals.css";
import { useState } from "react";
import { Provider } from "react-redux";
import { SessionProvider } from "next-auth/react";
import { makeStore } from "@/store";
import IntlProvider from "@/components/IntlProvider";
import Toast from "@/shared/components/Toast";
import { getMessages, getDirection } from "@/lib/i18n";

/**
 * Pages Router entry point.
 *
 * Layouts: pages that need the dashboard shell should export a `getLayout`
 * function. All others render bare (login, payment flows, register, etc.)
 *
 *   MyPage.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;
 */
export default function App({ Component, pageProps: { session, ...pageProps } }) {
  const [store] = useState(() => makeStore());

  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <Provider store={store}>
      <SessionProvider session={session}>
        <AppIntlWrapper>
          {getLayout(<Component {...pageProps} />)}
          <Toast />
        </AppIntlWrapper>
      </SessionProvider>
    </Provider>
  );
}

/**
 * Resolves locale from sessionStorage (set by DashboardLayout on profile load)
 * so the IntlProvider wrapping the full tree has a locale available on mount.
 */
function AppIntlWrapper({ children }) {
  const [locale] = useState(() => {
    if (typeof window === "undefined") return "en";
    return sessionStorage.getItem("ec_locale") || "en";
  });

  return (
    <IntlProvider locale={locale} messages={getMessages(locale)}>
      {children}
    </IntlProvider>
  );
}
