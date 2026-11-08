import type { SignField, SignForm, SignLang } from '../api';

const FIELD_LABELS: Record<SignLang, Record<string, string>> = {
  en: {
    participant_name: 'Participant name',
    email: 'Email',
    date: 'Date',
    id_number: 'ID number',
    initials: 'Initials',
    participant_signature: 'Participant signature',
    guardian_name: 'Parent or guardian name',
    guardian_signature: 'Parent or guardian signature',
    witness_name: 'Witness name',
    witness_signature: 'Witness signature',
  },
  zh: {
    participant_name: '参与者姓名',
    email: '电子邮箱',
    date: '日期',
    id_number: '证件号码',
    initials: '姓名缩写',
    participant_signature: '参与者签名',
    guardian_name: '家长或监护人姓名',
    guardian_signature: '家长或监护人签名',
    witness_name: '见证人姓名',
    witness_signature: '见证人签名',
  },
};

const FIELD_SHAPES: Omit<SignField, 'label'>[] = [
  { key: 'participant_name', type: 'text', required: true },
  { key: 'email', type: 'email', required: true },
  { key: 'date', type: 'date', required: true },
  { key: 'id_number', type: 'text', required: false },
  { key: 'initials', type: 'text', required: false },
  { key: 'participant_signature', type: 'signature', required: true },
  { key: 'guardian_name', type: 'text', required: false },
  { key: 'guardian_signature', type: 'signature', required: false },
  { key: 'witness_name', type: 'text', required: false },
  { key: 'witness_signature', type: 'signature', required: false },
];

const BODY: Record<SignLang, { title: string; bodyMarkdown: string }> = {
  en: {
    title: 'Release of liability and assumption of risk',
    bodyMarkdown: [
      '## Please read carefully',
      'Skiing and snowboarding involve **inherent risks**, including changing snow conditions, collisions and falls.',
      'By signing, I confirm that:',
      '- I take part voluntarily and accept these risks.',
      '- I will follow my instructor and the resort rules.',
      '- I am in good health to take part in lessons.',
      'Questions? See [our FAQ](https://ssnow.club/pages/faq).',
    ].join('\n\n'),
  },
  zh: {
    title: '免责声明与风险承担协议',
    bodyMarkdown: [
      '## 请仔细阅读',
      '滑雪和单板滑雪存在**固有风险**，包括雪况变化、碰撞和摔倒。',
      '签署即表示我确认：',
      '- 我自愿参加并接受上述风险。',
      '- 我会听从教练指导并遵守雪场规定。',
      '- 我的身体状况适合参加课程。',
      '有疑问？请查看[常见问题](https://ssnow.club/pages/faq)。',
    ].join('\n\n'),
  },
};

export const MOCK_SLUG = 'waiver';

export function mockSignForm(lang: SignLang, version = 3): SignForm {
  return {
    slug: MOCK_SLUG,
    lang,
    version,
    ...BODY[lang],
    fields: FIELD_SHAPES.map((field) => ({
      ...field,
      label: FIELD_LABELS[lang][field.key] ?? field.key,
    })),
  };
}
