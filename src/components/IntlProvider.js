import { IntlProvider as ReactIntlProvider } from "react-intl";

export default function IntlProvider({ locale, messages, children }) {
  return (
    <ReactIntlProvider locale={locale || "en"} messages={messages || {}} defaultLocale="en">
      {children}
    </ReactIntlProvider>
  );
}
