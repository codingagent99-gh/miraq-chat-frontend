/**
 * BillingAddressForm
 *
 * Public component for the billing address step.
 * Field order matches the CS site billing form:
 *   first_name · last_name | company | country | address_1 | address_2 |
 *   city | state | postcode | phone | email
 */
import { AddressForm } from "./AddressForm";
import type { AddressFormProps, FieldOverrides } from "./AddressForm";
import type { AddressDict } from "../../../types/actions";

/** All fields shown on the billing form, in CS site order. */
const BILLING_FIELDS: (keyof AddressDict)[] = [
  "first_name",
  "last_name",
  "company",
  "country",
  "address_1",
  "address_2",
  "city",
  "state",
  "postcode",
  "phone",
  "email",
];

// visibleFields is intentionally omitted from the public props —
// callers never need to touch it.
type BillingAddressFormProps = Omit<
  AddressFormProps,
  "visibleFields" | "fieldOverrides"
>;

/** State / County is mandatory on the billing form. */
const BILLING_FIELD_OVERRIDES: FieldOverrides = {
  state: { label: "State / County", required: true },
};

export function BillingAddressForm({
  submitLabel = "Continue to Shipping →",
  ...rest
}: BillingAddressFormProps) {
  return (
    <AddressForm
      {...rest}
      visibleFields={BILLING_FIELDS}
      fieldOverrides={BILLING_FIELD_OVERRIDES}
      submitLabel={submitLabel}
    />
  );
}
