import { use, useEffect, useState } from "react";
import { useRouter } from "next/router"; // migrated
import IntlProvider from "@/components/IntlProvider";
import { getMessages, getDirection } from "@/lib/i18n";
import LoadingView from "./_components/LoadingView";
import ErrorView from "./_components/ErrorView";
import RegisterPageInner from "./_components/RegisterPageInner";

/**
 * Public registration entry point for an activity.
 *
 * The page itself stays thin: it resolves params, fetches the activity (and
 * any pre-existing order via `?token=`) once on mount, and hands the result
 * to `RegisterPageInner`. All step state, validation, and side-effects live
 * in `_hooks/useRegistrationFlow.js`. Step views and small UI pieces live in
 * `_components/`. Pure helpers live in `_utils/`.
 */
export default function RegisterPage() {
  const resolvedParams = use(params);
  const activityId = resolvedParams.activityId;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [locale, setLocale] = useState("en");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(null);
  const [order, setOrder] = useState(null);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    const url = `/api/register/${activityId}${token ? `?token=${token}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        const lang = d.activity?.clubLanguage || "en";
        setLocale(lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = getDirection(lang);
        setActivity(d.activity);
        setMode(d.mode);
        if (d.order) setOrder(d.order);
      })
      .catch(() => setError(getMessages("en").register.failedToLoad))
      .finally(() => setLoading(false));
  }, [activityId, token]);

  return (
    <IntlProvider locale={locale} messages={getMessages(locale)}>
      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} />
      ) : (
        <RegisterPageInner
          activityId={activityId}
          token={token}
          activity={activity}
          order={order}
          mode={mode}
        />
      )}
    </IntlProvider>
  );
}
