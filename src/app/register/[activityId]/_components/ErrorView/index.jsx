import { useIntl } from "react-intl";

export default function ErrorView({ message }) {
  const intl = useIntl();
  const t = (id, values) => intl.formatMessage({ id: `payments.register.${id}` }, values);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-red-600 text-2xl font-bold">!</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{t("cannotAccess")}</h2>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
