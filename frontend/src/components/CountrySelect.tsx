import { type ComponentProps, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { countryOptions } from "../lib/countries";
import { SelectField } from "./SelectField";

type CountrySelectProps = Omit<
  ComponentProps<typeof SelectField>,
  "children"
> & {
  /** The blank option's text; a dash where the country is optional. */
  blank?: string;
};

/** Every country by name in the UI language, after a blank option. */
export function CountrySelect({ blank = "—", ...select }: CountrySelectProps) {
  const { i18n } = useTranslation();
  const countries = useMemo(
    () => countryOptions(i18n.language),
    [i18n.language],
  );
  return (
    <SelectField {...select}>
      <option value="">{blank}</option>
      {countries.map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </SelectField>
  );
}
