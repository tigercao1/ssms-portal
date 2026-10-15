import { Field, Input } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import type { InstructorProfile, UpdateProfileBody } from '@/lib/types';

const MAX_NAME = 100;

export interface LegalNameDraft {
  firstName: string;
  lastName: string;
}

export interface LegalNameErrors {
  firstName: string | null;
  lastName: string | null;
}

type SavedNames = Pick<InstructorProfile, 'firstName' | 'lastName'>;

export function toLegalNameDraft(profile: SavedNames): LegalNameDraft {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
  };
}

function legalNameRequired(draft: LegalNameDraft, saved: SavedNames) {
  return Boolean(
    saved.firstName ||
    saved.lastName ||
    draft.firstName.trim() ||
    draft.lastName.trim(),
  );
}

export function validateLegalName(
  draft: LegalNameDraft,
  saved: SavedNames,
  requiredMessage: string,
): LegalNameErrors {
  const required = legalNameRequired(draft, saved);
  return {
    firstName: required && !draft.firstName.trim() ? requiredMessage : null,
    lastName: required && !draft.lastName.trim() ? requiredMessage : null,
  };
}

export function changedLegalName(
  draft: LegalNameDraft,
  saved: SavedNames,
): Pick<UpdateProfileBody, 'firstName' | 'lastName'> {
  const body: Pick<UpdateProfileBody, 'firstName' | 'lastName'> = {};
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  if (firstName && firstName !== (saved.firstName ?? ''))
    body.firstName = firstName;
  if (lastName && lastName !== (saved.lastName ?? '')) body.lastName = lastName;
  return body;
}

export function LegalNameFields({
  value,
  saved,
  errors,
  onChange,
}: {
  value: LegalNameDraft;
  saved: SavedNames;
  errors: LegalNameErrors;
  onChange: (value: LegalNameDraft) => void;
}) {
  const t = useT();
  const required = legalNameRequired(value, saved);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label={t.auth.firstName}
        required={required}
        error={errors.firstName ?? undefined}
      >
        {(p) => (
          <Input
            {...p}
            autoComplete="given-name"
            maxLength={MAX_NAME}
            value={value.firstName}
            onChange={(e) => onChange({ ...value, firstName: e.target.value })}
          />
        )}
      </Field>
      <Field
        label={t.auth.lastName}
        required={required}
        error={errors.lastName ?? undefined}
      >
        {(p) => (
          <Input
            {...p}
            autoComplete="family-name"
            maxLength={MAX_NAME}
            value={value.lastName}
            onChange={(e) => onChange({ ...value, lastName: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}
