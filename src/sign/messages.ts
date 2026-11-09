import type { SignLang } from './api';

export interface SignMessages {
  htmlLang: string;
  loading: string;
  notFound: string;
  loadFailed: string;
  retry: string;
  required: (label: string) => string;
  invalidEmail: string;
  tooLong: (label: string, max: number) => string;
  notAccepted: (label: string) => string;
  signatureTooLarge: string;
  payloadTooLarge: string;
  language: string;
  signatureRequired: (label: string) => string;
  optional: string;
  signHere: (label: string) => string;
  signHint: string;
  clear: string;
  undo: string;
  redo: string;
  consent: string;
  consentRequired: string;
  submit: string;
  submitting: string;
  fixErrors: string;
  stale: string;
  invalid: string;
  throttled: string;
  submitFailed: string;
  signed: string;
  signedNotEmailed: string;
  back: string;
  viewOriginal: string;
  hideOriginal: string;
  originalDocument: string;
  pdfLoading: string;
  pdfFailed: string;
  pdfOpenInTab: string;
  previousPage: string;
  nextPage: string;
  pageList: string;
  pageOf: (page: number, total: number) => string;
  review: string;
  reviewHeading: string;
  previewNotice: string;
  previewPageOf: (page: number, total: number) => string;
  backToEdit: string;
  confirm: string;
}

const en: SignMessages = {
  htmlLang: 'en',
  loading: 'Loading…',
  notFound: 'This form could not be found. Please check the link.',
  loadFailed:
    'The form could not be loaded. Check your connection and try again.',
  retry: 'Try again',
  required: (label) => `${label} is required.`,
  invalidEmail: 'Enter a valid email address.',
  tooLong: (label, max) => `${label} must be ${max} characters or fewer.`,
  notAccepted: (label) => `${label} was not accepted. Please check it.`,
  signatureTooLarge:
    'This signature is too detailed to save. Please clear it and sign again.',
  payloadTooLarge:
    'Your signatures are too large to send together. Please clear one and sign it again.',
  language: 'Language',
  signatureRequired: (label) => `Please sign in the ${label} box.`,
  optional: 'optional',
  signHere: (label) => `${label}, draw your signature here`,
  signHint: 'Sign with your finger or mouse.',
  clear: 'Clear',
  undo: 'Undo',
  redo: 'Redo',
  consent:
    'I have read and agree to the above, and I agree to sign electronically.',
  consentRequired: 'Please tick the box to agree before submitting.',
  submit: 'Sign and submit',
  submitting: 'Submitting…',
  fixErrors: 'Please fix the highlighted fields.',
  stale:
    'This form was just updated. We loaded the latest version; please review it and submit again.',
  invalid: 'Some answers were not accepted. Please check them and try again.',
  throttled: 'Too many attempts. Please wait a minute and try again.',
  submitFailed: 'Something went wrong. Please try again.',
  signed: 'Signed, a copy has been emailed to you.',
  signedNotEmailed:
    'Signed. We could not email your copy right now; our team has your signed form.',
  back: 'Back',
  viewOriginal: 'View original document',
  hideOriginal: 'Hide original document',
  originalDocument: 'Original document',
  pdfLoading: 'Loading the document…',
  pdfFailed: 'The document could not be shown here.',
  pdfOpenInTab: 'Open in a new tab',
  previousPage: 'Previous',
  nextPage: 'Next',
  pageList: 'Page',
  pageOf: (page, total) => `Page ${page} of ${total}`,
  review: 'Review',
  reviewHeading: 'Check your document',
  previewNotice: 'Preview, the signed copy is created when you confirm',
  previewPageOf: (page, total) =>
    `Preview of page ${page} of ${total} with your answers`,
  backToEdit: 'Back to edit',
  confirm: 'Confirm and sign',
};

const zh: SignMessages = {
  htmlLang: 'zh-CN',
  loading: '加载中…',
  notFound: '找不到此表格，请检查链接。',
  loadFailed: '表格加载失败，请检查网络后重试。',
  retry: '重试',
  required: (label) => `请填写${label}。`,
  invalidEmail: '请输入有效的电子邮箱地址。',
  tooLong: (label, max) => `${label}不能超过${max}个字符。`,
  notAccepted: (label) => `“${label}”未通过校验，请检查。`,
  signatureTooLarge: '此签名过于复杂，无法保存。请清除后重新签名。',
  payloadTooLarge: '签名数据过大，无法一起提交。请清除其中一个签名后重新签名。',
  language: '语言',
  signatureRequired: (label) => `请在“${label}”框内签名。`,
  optional: '选填',
  signHere: (label) => `${label}，请在此处签名`,
  signHint: '请用手指或鼠标签名。',
  clear: '清除',
  undo: '撤销',
  redo: '重做',
  consent: '我已阅读并同意以上内容，并同意以电子方式签署。',
  consentRequired: '提交前请勾选同意。',
  submit: '签署并提交',
  submitting: '提交中…',
  fixErrors: '请修改标出的内容。',
  stale: '此表格刚刚更新，已为您加载最新版本，请重新查看后再提交。',
  invalid: '部分内容未通过校验，请检查后重试。',
  throttled: '尝试次数过多，请稍等一分钟后再试。',
  submitFailed: '出现问题，请重试。',
  signed: '已签署，副本已发送至您的邮箱。',
  signedNotEmailed:
    '已签署。副本暂时无法发送至您的邮箱，我们已收到您签署的表格。',
  back: '返回',
  viewOriginal: '查看原始文件',
  hideOriginal: '收起原始文件',
  originalDocument: '原始文件',
  pdfLoading: '文件加载中…',
  pdfFailed: '文件无法在此显示。',
  pdfOpenInTab: '在新标签页中打开',
  previousPage: '上一页',
  nextPage: '下一页',
  pageList: '页码',
  pageOf: (page, total) => `第 ${page} 页，共 ${total} 页`,
  review: '预览并核对',
  reviewHeading: '请核对文件',
  previewNotice: '预览：确认后才会生成已签署的副本',
  previewPageOf: (page, total) =>
    `第 ${page} 页（共 ${total} 页）预览，含您填写的内容`,
  backToEdit: '返回修改',
  confirm: '确认并签署',
};

export const SIGN_MESSAGES: Record<SignLang, SignMessages> = { en, zh };
