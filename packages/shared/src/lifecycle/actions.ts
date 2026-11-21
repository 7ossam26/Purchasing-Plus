import type { RequestState, Viewer } from './model.js';
import * as buying from './purchasing.js';
import * as request from './request.js';

export const actions = {
  submit: request.submit,
  resubmit: request.resubmit,
  approve: request.approve,
  resume: request.resume,
  submitPricing: buying.submitPricing,
  approvePricing: buying.approvePricing,
  recordReceipt: buying.recordReceipt,
  saveDraft: request.saveDraft,
  editBeforeApproval: request.editBeforeApproval,
  editQuantities: request.editQuantities,
  editWhilePaused: request.editWhilePaused,
  raiseUrgency: request.raiseUrgency,
  pause: request.pause,
  returnForEdit: request.returnForEdit,
  purchasingReturnForEdit: request.purchasingReturnForEdit,
  createBatch: buying.createBatch,
  markBatchSent: buying.markBatchSent,
  savePricingDraft: buying.savePricingDraft,
  markUnavailable: buying.markUnavailable,
  markAvailable: buying.markAvailable,
  priceUnavailable: buying.priceUnavailable,
  markSupplyOrderSent: buying.markSupplyOrderSent,
  stillComing: buying.stillComing,
  repriceRemaining: buying.repriceRemaining,
  resolveExternally: buying.resolveExternally,
  editDeliveryFee: request.editDeliveryFee,
  copyRequest: request.copyRequest,
  addToCatalog: request.addToCatalog,
  reject: request.reject,
  rejectPricing: buying.rejectPricing,
  cancel: request.cancel,
  deleteDraft: request.deleteDraft,
  autoComplete: request.autoComplete,
} as const;
export type ActionName = keyof typeof actions;
export const { can: canAddToCatalog, apply: applyAddToCatalog } = actions.addToCatalog;
export type ActionInput<A extends ActionName> = Parameters<
  (typeof actions)[A]['apply']
>[2];

export function availableActions(state: RequestState, viewer: Viewer) {
  return (Object.keys(actions) as ActionName[])
    .filter((name) => actions[name].available(state, viewer).ok)
    .map((name) => ({ action: name, hint: actions[name].hint }));
}

export const { can: canSaveDraft, apply: applySaveDraft } = actions.saveDraft;
export const { can: canDeleteDraft, apply: applyDeleteDraft } =
  actions.deleteDraft;
export const { can: canSubmit, apply: applySubmit } = actions.submit;
export const { can: canEditBeforeApproval, apply: applyEditBeforeApproval } =
  actions.editBeforeApproval;
export const { can: canEditQuantities, apply: applyEditQuantities } =
  actions.editQuantities;
export const { can: canApprove, apply: applyApprove } = actions.approve;
export const { can: canReject, apply: applyReject } = actions.reject;
export const { can: canReturnForEdit, apply: applyReturnForEdit } =
  actions.returnForEdit;
export const { can: canResubmit, apply: applyResubmit } = actions.resubmit;
export const { can: canRaiseUrgency, apply: applyRaiseUrgency } =
  actions.raiseUrgency;
export const { can: canPause, apply: applyPause } = actions.pause;
export const {
  can: canPurchasingReturnForEdit,
  apply: applyPurchasingReturnForEdit,
} = actions.purchasingReturnForEdit;
export const { can: canEditWhilePaused, apply: applyEditWhilePaused } =
  actions.editWhilePaused;
export const { can: canResume, apply: applyResume } = actions.resume;
export const { can: canCancel, apply: applyCancel } = actions.cancel;
export const { can: canAutoComplete, apply: applyAutoComplete } =
  actions.autoComplete;
export const { can: canEditDeliveryFee, apply: applyEditDeliveryFee } =
  actions.editDeliveryFee;
export const { can: canCopyRequest, apply: applyCopyRequest } =
  actions.copyRequest;
export const { can: canCreateBatch, apply: applyCreateBatch } =
  actions.createBatch;
export const { can: canMarkBatchSent, apply: applyMarkBatchSent } =
  actions.markBatchSent;
export const { can: canSavePricingDraft, apply: applySavePricingDraft } =
  actions.savePricingDraft;
export const { can: canMarkUnavailable, apply: applyMarkUnavailable } =
  actions.markUnavailable;
export const { can: canMarkAvailable, apply: applyMarkAvailable } =
  actions.markAvailable;
export const { can: canSubmitPricing, apply: applySubmitPricing } =
  actions.submitPricing;
export const { can: canApprovePricing, apply: applyApprovePricing } =
  actions.approvePricing;
export const { can: canRejectPricing, apply: applyRejectPricing } =
  actions.rejectPricing;
export const { can: canPriceUnavailable, apply: applyPriceUnavailable } =
  actions.priceUnavailable;
export const { can: canMarkSupplyOrderSent, apply: applyMarkSupplyOrderSent } =
  actions.markSupplyOrderSent;
export const { can: canRecordReceipt, apply: applyRecordReceipt } =
  actions.recordReceipt;
export const { can: canStillComing, apply: applyStillComing } =
  actions.stillComing;
export const { can: canRepriceRemaining, apply: applyRepriceRemaining } =
  actions.repriceRemaining;
export const { can: canResolveExternally, apply: applyResolveExternally } =
  actions.resolveExternally;
