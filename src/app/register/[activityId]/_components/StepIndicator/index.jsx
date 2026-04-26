"use client";

export default function StepIndicator({ current, completed, steps }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8 px-2 w-full">
      {steps.map((s, idx) => {
        const isDone = completed.includes(s.num);
        const isActive = s.num === current;
        const isLast = idx === steps.length - 1;
        return (
          <div key={s.num} className={`flex items-center ${isLast ? "" : "flex-1 min-w-0"}`}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-all shrink-0 ${
                  isDone
                    ? "bg-green-600 text-white"
                    : isActive
                      ? "bg-blue-600 text-white shadow-lg ring-4 ring-blue-100"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {isDone ? (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s.num
                )}
              </div>
              <span
                className={`text-[10px] sm:text-xs mt-1.5 font-medium whitespace-nowrap ${isActive ? "text-blue-600" : isDone ? "text-green-600" : "text-gray-400"}`}
              >
                {s.label}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 min-w-[12px] h-0.5 ms-1 me-1 sm:ms-2 sm:me-2 mb-5 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
