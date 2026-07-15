/**
 * BillingAddressForm
 *
 * Public component for the billing address step.
 * Field order matches the CS site billing form:
 *   first_name · last_name | company | country | address_1 | address_2 |
 *   city | state | postcode | phone | email | project_rep
 */
import { AddressForm } from "./AddressForm";
import type {
  AddressFormProps,
  FieldOverrides,
  CustomField,
} from "./AddressForm";
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

// ── Label-only overrides ─────────────────────────────────────────────────────
const BILLING_LABEL_OVERRIDES: FieldOverrides = {
  state: { label: "State / County" },
};

type BillingAddressFormProps = Omit<AddressFormProps, "visibleFields"> & {
  /** Live country list from useCheckoutFields — passed down from AddressStep. */
  countries?: WpCountry[];
  /** CS rep options from useCheckoutFields — passed down from AddressStep. */
  repOptions?: WpRep[];
  /** Order Type options from /checkout-fields — passed down from AddressStep. */
  orderTypeOptions?: WpOrderTypeOption[];
  /** Required flags derived from /checkout-fields by useCheckoutFields. */
  fieldOverrides?: FieldOverrides;
};

export function BillingAddressForm({
  submitLabel = "Continue to Shipping →",
  countries,
  repOptions,
  orderTypeOptions,
  fieldOverrides,
  dynamicFields,
  ...rest
}: BillingAddressFormProps & {
  dynamicFields?: (keyof AddressDict | CustomField)[];
}) {
  // Merge label-only overrides with API-supplied required flags.
  const mergedOverrides: FieldOverrides = {
    ...BILLING_LABEL_OVERRIDES,
    ...fieldOverrides,
    billing_field_type: {
      label: fieldOverrides?.billing_field_type?.label,
      required: true,
    },
    state: {
      label: "State / County",
      ...fieldOverrides?.state,
    },
  };
  const resolvedFields = dynamicFields?.length ? dynamicFields : BILLING_FIELDS;

  return (
    <AddressForm
      {...rest}
      visibleFields={resolvedFields}
      fieldOverrides={mergedOverrides}
      submitLabel={submitLabel}
      countries={countries}
      repOptions={repOptions}
      orderTypeOptions={orderTypeOptions}
    />
  );
}
