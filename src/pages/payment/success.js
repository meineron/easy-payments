import Link from "next/link";

export default function PaymentSuccess() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-gray-500 mb-6">
          Your payment of $10.00 has been processed. You will receive an invoice via email.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/dashboard"
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/dashboard/transactions"
            className="bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition"
          >
            View Transactions
          </Link>
        </div>
      </div>
    </div>
  );
}
