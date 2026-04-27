import { useIntl } from "react-intl";

export default function LoadingView() {
  const intl = useIntl();
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" aria-hidden />
        <p className="text-gray-500">{tc("loading")}</p>
      </div>
    </div>
  );
}
