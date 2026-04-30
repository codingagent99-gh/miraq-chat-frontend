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
  type WpCountry,
  type WpRep,
} from "../services/api";

export type { WpCountry, WpRep };

export interface CheckoutFieldsData {
  countries: WpCountry[];
  reps: WpRep[];
  isLoading: boolean;
  error: string | null;
}

export function useCheckoutFields(wpBase: string): CheckoutFieldsData {
  const [countries, setCountries] = useState<WpCountry[]>([]);
  const [reps, setReps] = useState<WpRep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wpBase) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([fetchWpCountries(wpBase), fetchWpReps(wpBase)])
      .then(([countriesData, repsData]) => {
        if (cancelled) return;
        setCountries(countriesData);
        setReps(repsData);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[useCheckoutFields] Failed to fetch from WP:", err);
        setError(err?.message ?? "Failed to load checkout fields");
        // Countries/reps stay empty — AddressForm falls back to its
        // built-in COUNTRIES list and hides the rep dropdown.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wpBase]);

  return { countries, reps, isLoading, error };
}
