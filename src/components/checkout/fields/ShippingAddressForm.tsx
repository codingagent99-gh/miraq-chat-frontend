/**
 * ShippingAddressForm
 *
 * Public component for the shipping address step.
 * Field order matches the CS site shipping form HTML exactly:
 *   first_name · last_name | company | country | address_1 | address_2 |
 *   city | state | postcode
 *
 * No phone or email — those live on the billing form only.
 */
import { AddressForm } from "./AddressForm";
import type { AddressFormProps } from "./AddressForm";
import type { AddressDict } from "../../../types/actions";

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

type ShippingAddressFormProps = Omit<AddressFormProps, "visibleFields">;

export function ShippingAddressForm({
  submitLabel = "Continue to Payment →",
  ...rest
}: ShippingAddressFormProps) {
  return (
    <AddressForm
      {...rest}
      visibleFields={SHIPPING_FIELDS}
      submitLabel={submitLabel}
    />
  );
}
