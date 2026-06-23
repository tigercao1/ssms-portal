/**
 * Message contract (W1.5 + feature namespaces W2.14/W2.15). Access is fully
 * typed: `const t = useT(); t.profile.editProfile`. Keys mirror the API
 * `src/i18n` contract where they overlap (PORTAL_I18N_PLAN.md).
 */
export interface Messages {
  common: {
    appName: string;
    tagline: string;
    save: string;
    cancel: string;
    edit: string;
    signOut: string;
    retry: string;
    loading: string;
    language: string;
    english: string;
    chinese: string;
    back: string;
    add: string;
    remove: string;
    none: string;
    yes: string;
    no: string;
    saved: string;
  };
  auth: {
    signInTitle: string;
    signInSubtitle: string;
    email: string;
    password: string;
    signInButton: string;
    signingIn: string;
    forgotPassword: string;
    invalidCredentials: string;
    genericError: string;
    noAccount: string;
    createAccount: string;
    haveAccount: string;
    signUpTitle: string;
    signUpSubtitle: string;
    signUpButton: string;
    signingUp: string;
    passwordHint: string;
    signUpDone: string;
    signUpDoneBody: string;
    emailInUse: string;
    verifyTitle: string;
    verifyBody: string;
    resend: string;
    resent: string;
    backToSignIn: string;
    resetTitle: string;
    resetBody: string;
    sendReset: string;
    resetSent: string;
    updatePwTitle: string;
    newPassword: string;
    updatePw: string;
    pwUpdated: string;
  };
  nav: {
    profile: string;
    settings: string;
    dashboard: string;
    instructors: string;
    reference: string;
    instructorArea: string;
    adminArea: string;
  };
  status: {
    pending: string;
    approved: string;
    rejected: string;
    inactive: string;
    active: string;
  };
  profile: {
    title: string;
    pendingBanner: string;
    approvedBanner: string;
    rejectedBanner: string;
    inactiveBanner: string;
    editProfile: string;
    bio: string;
    certifications: string;
    trainerStatus: string;
    locations: string;
    languages: string;
    courseLevels: string;
    noneYet: string;
    emptyHint: string;
    // form
    editTitle: string;
    identitySection: string;
    bioSection: string;
    detailsSection: string;
    teachingSection: string;
    certsSection: string;
    displayNameEn: string;
    displayNameZh: string;
    bioEn: string;
    bioZh: string;
    dateOfBirth: string;
    dobHint: string;
    emailReadonly: string;
    aiFillHint: string;
    photo: string;
    addCert: string;
    addTrainer: string;
    org: string;
    track: string;
    level: string;
    partial: string;
    components: string;
    achievedOn: string;
    discipline: string;
    trainerLevel: string;
    rookieDone: string;
    examPassed: string;
    saveChanges: string;
    savedToast: string;
    uploadPhoto: string;
    photoHint: string;
    uploading: string;
  };
  settings: {
    title: string;
    languageLabel: string;
    languageHint: string;
    account: string;
    signedInAs: string;
  };
  admin: {
    dashboardTitle: string;
    statPending: string;
    statApproved: string;
    statInactive: string;
    needsReview: string;
    noPending: string;
    listTitle: string;
    filterStatus: string;
    filterActive: string;
    all: string;
    colName: string;
    colEmail: string;
    colStatus: string;
    colActive: string;
    colApplied: string;
    noInstructors: string;
    detailTitle: string;
    actions: string;
    approve: string;
    reject: string;
    rejectReason: string;
    activate: string;
    deactivate: string;
    roleSection: string;
    makeAdmin: string;
    makeInstructor: string;
    cantChangeOwnRole: string;
    editProfile: string;
    actionDone: string;
    referenceTitle: string;
    addRow: string;
    keyLabel: string;
    nameLabel: string;
    sortOrder: string;
    activeLabel: string;
    addedRow: string;
    duplicateKey: string;
  };
  reference: {
    teachingLocations: string;
    languages: string;
    courseLevels: string;
    examPreps: string;
  };
  validation: {
    required: string;
    maxLen: string;
    pastDate: string;
  };
  errors: {
    network: string;
    forbidden: string;
    generic: string;
  };
}

export type Locale = 'en' | 'zh-CN';
