/**
 * Installment fee + schedule math for the registration page.
 *
 * Pure functions — no React, no DOM. Lives next to the route because the
 * shape of `opts` (`installmentFeeThreshold`, `installmentFeePercent`,
 * `installmentFeeMode`) is specific to subscription docs as consumed in the
 * register flow. Promote to `lib/` if a second route ever needs it.
 */

export function computeFee(totalCents, chosen, opts) {
  const threshold = opts?.installmentFeeThreshold || 0;
  const percent = opts?.installmentFeePercent || 0;
  if (threshold <= 0 || percent <= 0 || chosen <= threshold) return 0;
  return Math.round((totalCents * percent) / 100);
}

export function buildPreviewSchedule(
  totalCostCents,
  dueDateAmountCents,
  chosen,
  firstInstallmentDate,
  labels,
  opts
) {
  const feeCents = computeFee(totalCostCents, chosen, opts);
  const feeMode = opts?.installmentFeeMode || "split";

  if (chosen <= 1) {
    return {
      schedule: [
        { number: 1, date: new Date(), amountCents: totalCostCents, label: labels.payInFull },
      ],
      feeCents: 0,
    };
  }

  let dueNow = dueDateAmountCents || totalCostCents;
  let remaining;
  if (feeCents > 0 && feeMode === "due_date") {
    dueNow = (dueDateAmountCents || totalCostCents) + feeCents;
    remaining = Math.max(0, totalCostCents - (dueDateAmountCents || totalCostCents));
  } else {
    const effectiveTotal = totalCostCents + feeCents;
    remaining = Math.max(0, effectiveTotal - dueNow);
  }

  const numRemaining = Math.max(0, chosen - 1);
  const schedule = [{ number: 1, date: new Date(), amountCents: dueNow, label: labels.dueNow }];
  if (numRemaining > 0 && remaining > 0) {
    const perInstallment = Math.round(remaining / numRemaining);
    const now = new Date();
    let firstDate = firstInstallmentDate ? new Date(firstInstallmentDate) : null;
    if (!firstDate || now > firstDate) {
      firstDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    for (let i = 0; i < numRemaining; i++) {
      const d = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, firstDate.getDate());
      const amt = i === numRemaining - 1
        ? remaining - perInstallment * (numRemaining - 1)
        : perInstallment;
      schedule.push({ number: i + 2, date: d, amountCents: amt });
    }
  }
  return { schedule, feeCents };
}

export function buildSteps(hasWaivers, t) {
  const steps = [
    { num: 1, label: t("parentDetails") },
    { num: 2, label: t("playerDetails") },
  ];
  if (hasWaivers) steps.push({ num: 3, label: t("waivers") });
  steps.push({ num: hasWaivers ? 4 : 3, label: t("invoicePayment") });
  return steps;
}
