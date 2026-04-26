"use client";

import { useEffect, useRef } from "react";
import ContactForm from "../ContactForm";
import StepIndicator from "../StepIndicator";
import ParentDetailsStep from "../ParentDetailsStep";
import PlayerDetailsStep from "../PlayerDetailsStep";
import WaiversStep from "../WaiversStep";
import OtpVerifyPanel, { OtpProcessingView } from "../OtpVerifyPanel";
import AlreadyPaidNotice from "../AlreadyPaidNotice";
import InvoiceStep from "../InvoiceStep";
import { centsToDisplay } from "@/shared/utils/formatting";
import useRegistrationFlow from "../../_hooks/useRegistrationFlow";

export default function RegisterPageInner({ activityId, token, activity, order, mode }) {
  // `mode` is currently passed for future use (resume vs fresh) — the hook
  // derives behaviour from the order shape itself, so we don't need it yet.
  void mode;

  const flow = useRegistrationFlow({ activityId, token, activity, order });

  // The OTP panel ref lives in this component (not the hook) so the hook can
  // stay ref-free. We scroll the panel into view whenever we transition to
  // the "processing" stage so the user sees the spinner even on small
  // viewports where the keyboard may have hidden the panel.
  const otpPanelRef = useRef(null);
  useEffect(() => {
    if (flow.verifyStage !== "processing") return;
    requestAnimationFrame(() => {
      if (otpPanelRef.current) {
        otpPanelRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [flow.verifyStage]);

  if (flow.orderFullyRegisteredAndPaid) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            {activity?.clubLogoUrl && (
              <img
                src={activity.clubLogoUrl}
                alt={activity?.clubName || ""}
                className="h-14 w-auto mx-auto mb-3 object-contain"
              />
            )}
            <h1 className="text-2xl font-bold text-gray-900">
              {activity?.title || flow.t("registration")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {activity?.clubName}
              {activity?.season ? ` · ${activity.season}` : ""}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{flow.t("alreadyRegistered")}</h2>
              <p className="text-sm text-gray-500">{flow.t("alreadyRegisteredDesc")}</p>
              <div className="mt-3 inline-block bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-sm font-medium">
                {flow.tp("alreadyPaid")} — ${centsToDisplay(flow.liveOrder.paidCents)}
              </div>
            </div>
            <hr className="my-6" />
            <ContactForm
              activityId={activityId}
              activity={activity}
              order={flow.liveOrder}
              t={flow.t}
              tc={flow.tc}
            />
          </div>
        </div>
      </div>
    );
  }

  const onWaiverStep = flow.hasWaivers && flow.step === flow.waiverStepNum;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          {activity?.clubLogoUrl && (
            <img
              src={activity.clubLogoUrl}
              alt={activity?.clubName || ""}
              className="h-14 w-auto mx-auto mb-3 object-contain"
            />
          )}
          <h1 className="text-2xl font-bold text-gray-900">
            {activity?.title || flow.t("registration")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {activity?.clubName}
            {activity?.season ? ` · ${activity.season}` : ""}
          </p>
        </div>

        <StepIndicator current={flow.step} completed={flow.completedSteps} steps={flow.STEPS} />

        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
          {flow.step === 1 && (
            <ParentDetailsStep
              parent1={flow.parent1}
              setParent1={flow.setParent1}
              parent2={flow.parent2}
              setParent2={flow.setParent2}
              onContinue={flow.completeStep1}
              t={flow.t}
              tc={flow.tc}
            />
          )}

          {flow.step === 2 && (
            <PlayerDetailsStep
              player={flow.player}
              setPlayer={flow.setPlayer}
              formData={flow.formData}
              setFormData={flow.setFormData}
              playerCustomFields={flow.playerCustomFields}
              teams={flow.teams}
              initialOrder={flow.initialOrder}
              activity={activity}
              teamId={flow.teamId}
              onTeamChange={flow.onTeamChange}
              subscriptionId={flow.subscriptionId}
              onSubChange={flow.onSubChange}
              availableSubs={flow.availableSubs}
              savingDraft={flow.savingDraft}
              onBack={() => flow.goToStep(1)}
              onContinue={flow.completeStep2}
              t={flow.t}
              tc={flow.tc}
            />
          )}

          {onWaiverStep && flow.verifyStage === "processing" && (
            <div ref={otpPanelRef}>
              <OtpProcessingView t={flow.t} />
            </div>
          )}

          {onWaiverStep && flow.verifyStage === "otp" && (
            <OtpVerifyPanel
              ref={otpPanelRef}
              parent1Email={flow.parent1.email}
              verifyCode={flow.verifyCode}
              setVerifyCode={flow.setVerifyCode}
              verifyError={flow.verifyError}
              setVerifyError={flow.setVerifyError}
              verifyInfo={flow.verifyInfo}
              setVerifyInfo={flow.setVerifyInfo}
              sendingCode={flow.sendingCode}
              verifying={flow.verifying}
              onEditEmail={flow.editEmailFromOtp}
              onResend={flow.resendVerificationCode}
              onSubmit={flow.submitVerificationCode}
              setVerifyStage={flow.setVerifyStage}
              t={flow.t}
            />
          )}

          {onWaiverStep && flow.verifyStage === "waivers" && (
            <WaiversStep
              waivers={flow.waivers}
              waiverConsents={flow.waiverConsents}
              setWaiverConsents={flow.setWaiverConsents}
              savedWaiverIds={flow.savedWaiverIds}
              initialOrder={flow.initialOrder}
              waiverName={flow.waiverName}
              savingDraft={flow.savingDraft}
              sendingCode={flow.sendingCode}
              onBack={() => flow.goToStep(2)}
              onContinue={flow.completeWaivers}
              t={flow.t}
              tc={flow.tc}
            />
          )}

          {flow.step === flow.invoiceStepNum && flow.orderPaidNoRegistration && (
            <AlreadyPaidNotice
              activityId={activityId}
              activity={activity}
              liveOrder={flow.liveOrder}
              waiversLocked={flow.waiversLocked}
              onBack={() => flow.goToStep(flow.hasWaivers ? flow.waiverStepNum : 2)}
              t={flow.t}
              tc={flow.tc}
              tp={flow.tp}
            />
          )}

          {flow.step === flow.invoiceStepNum && !flow.orderPaidNoRegistration && (
            <InvoiceStep
              player={flow.player}
              parent1={flow.parent1}
              teamId={flow.teamId}
              teams={flow.teams}
              activity={activity}
              subscriptionTitle={flow.subscriptionTitle}
              subscriptionPriceCents={flow.subscriptionPriceCents}
              displayItems={flow.displayItems}
              couponResult={flow.couponResult}
              total={flow.total}
              couponCode={flow.couponCode}
              setCouponCode={flow.setCouponCode}
              applyCoupon={flow.applyCoupon}
              couponLoading={flow.couponLoading}
              maxInstallments={flow.maxInstallments}
              chosenInstallments={flow.chosenInstallments}
              setChosenInstallments={flow.setChosenInstallments}
              currentSub={flow.currentSub}
              schedule={flow.schedule}
              feeCents={flow.feeCents}
              agreedToTerms={flow.agreedToTerms}
              setAgreedToTerms={flow.setAgreedToTerms}
              paying={flow.paying}
              hasWaivers={flow.hasWaivers}
              waiverStepNum={flow.waiverStepNum}
              waiversLocked={flow.waiversLocked}
              goToStep={flow.goToStep}
              saveAndPay={flow.saveAndPay}
              t={flow.t}
              tc={flow.tc}
              tp={flow.tp}
            />
          )}
        </div>
      </div>
    </div>
  );
}
