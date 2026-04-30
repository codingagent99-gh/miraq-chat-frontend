/**
 * ShippingAddressForm
 *
 * Public component for the shipping address step.
 * Field order matches the CS site shipping form HTML exactly:
 *   first_name · last_name | company | country | address_1 | address_2 |
 *   city | state | postcode
 *
 * No phone, email, or project_rep — those live on the billing form only.
 */
import { AddressForm } from "./AddressForm";
import type { AddressFormProps, FieldOverrides } from "./AddressForm";
import type { AddressDict } from "../../../types/actions";
import type { WpCountry } from "../../../hooks/useCheckoutFields";

/** Fields shown on the shipping form. Matches CS site HTML exactly. */
const SHIPPING_FIELDS: (keyof AddressDict)[] = [
  "first_name",
  "last_name",
  "company",
  "country",
  "address_1",
  "address_2",
  "city",
  "state",
  "postcode",
];

type ShippingAddressFormProps = Omit<
  AddressFormProps,
  "visibleFields" | "fieldOverrides"
> & {
  /** Live country list from useCheckoutFields — passed down from AddressStep. */
  countries?: WpCountry[];
};

/** State is optional on shipping — label reflects this. */
const SHIPPING_FIELD_OVERRIDES: FieldOverrides = {
  state: { label: "County (optional)" },
};

export function ShippingAddressForm({
  submitLabel = "Continue to Payment →",
  countries,
  ...rest
}: ShippingAddressFormProps) {
  return (
    <AddressForm
      {...rest}
      visibleFields={SHIPPING_FIELDS}
      fieldOverrides={SHIPPING_FIELD_OVERRIDES}
      submitLabel={submitLabel}
      countries={countries}
    />
  );
}
