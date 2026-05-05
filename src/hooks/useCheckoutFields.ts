/**
 * useCheckoutFields
 *
 * Fetches countries (with embedded states) and cs_rep users from the
 * WooCommerce plugin's custom REST endpoints:
 *   GET /wp-json/custom-api/v1/countries
 *   GET /wp-json/custom-api/v1/reps
 *
 * Usage:
 *   const { countries, reps, isLoading } = useCheckoutFields(siteOrigin);
 */
import { useState, useEffect } from "react";
import {
  fetchWpCountries,
  fetchWpReps,
  fetchWpCheckoutFields,
  type WpCountry,
  type WpRep,
  type WpOrderTypeOption,
} from "../services/api";

export type { WpCountry, WpRep, WpOrderTypeOption };

export interface CheckoutFieldsData {
  countries: WpCountry[];
  reps: WpRep[];
  orderTypeOptions: WpOrderTypeOption[];
  isLoading: boolean;
  error: string | null;
}

export function useCheckoutFields(wpBase: string): CheckoutFieldsData {
  const [countries, setCountries] = useState<WpCountry[]>([]);
  const [reps, setReps] = useState<WpRep[]>([]);
  const [orderTypeOptions, setOrderTypeOptions] = useState<WpOrderTypeOption[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wpBase) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([
      fetchWpCountries(wpBase),
      fetchWpReps(wpBase),
      fetchWpCheckoutFields(wpBase),
    ])
      .then(([countriesData, repsData, orderTypeData]) => {
        if (cancelled) return;
        setCountries(countriesData);
        setReps(repsData);
        setOrderTypeOptions(orderTypeData);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[useCheckoutFields] Failed to fetch from WP:", err);
        setError(err?.message ?? "Failed to load checkout fields");
        // All fields stay empty — AddressForm falls back to built-in defaults.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wpBase]);

  return { countries, reps, orderTypeOptions, isLoading, error };
}
