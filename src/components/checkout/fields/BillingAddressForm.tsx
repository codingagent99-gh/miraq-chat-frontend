/**
 * BillingAddressForm
 *
 * Public component for the billing address step.
 * Field order matches the CS site billing form:
 *   first_name · last_name | company | country | address_1 | address_2 |
 *   city | state | postcode | phone | email | project_rep
 */
import { AddressForm } from "./AddressForm";
import type { AddressFormProps, FieldOverrides } from "./AddressForm";
import type { AddressDict } from "../../../types/actions";
import type {
  WpCountry,
  WpRep,
  WpOrderTypeOption,
} from "../../../hooks/useCheckoutFields";

/** All fields shown on the billing form, in CS site order. */
const BILLING_FIELDS: (
  | keyof AddressDict
  | "project_rep"
  | "billing_field_type"
  | "billing_project"
)[] = [
  "first_name",
  "last_name",
  "company",
  "billing_field_type", // Order Type — /wp-json/custom-api/v1/checkout-fields
  "billing_project", // Project Name
  "country",
  "address_1",
  "address_2",
  "city",
  "state",
  "postcode",
  "phone",
  "email",
  "project_rep", // Your Rep — /wp-json/custom-api/v1/reps
];

// visibleFields is intentionally omitted from the public props —
// callers never need to touch it.
type BillingAddressFormProps = Omit<
  AddressFormProps,
  "visibleFields" | "fieldOverrides"
> & {
  /** Live country list from useCheckoutFields — passed down from AddressStep. */
  countries?: WpCountry[];
  /** CS rep options from useCheckoutFields — passed down from AddressStep. */
  repOptions?: WpRep[];
  /** Order Type options from /checkout-fields — passed down from AddressStep. */
  orderTypeOptions?: WpOrderTypeOption[];
};

/** Company name, Order Type are mandatory on the billing form. State / County is mandatory too. */
const BILLING_FIELD_OVERRIDES: FieldOverrides = {
  company: { required: true },
  billing_field_type: { required: true },
  state: { label: "State / County", required: true },
};

export function BillingAddressForm({
  submitLabel = "Continue to Shipping →",
  countries,
  repOptions,
  orderTypeOptions,
  ...rest
}: BillingAddressFormProps) {
  return (
    <AddressForm
      {...rest}
      visibleFields={BILLING_FIELDS}
      fieldOverrides={BILLING_FIELD_OVERRIDES}
      submitLabel={submitLabel}
      countries={countries}
      repOptions={repOptions}
      orderTypeOptions={orderTypeOptions}
    />
  );
}
