// Currencies whose code doesn't start with the country's (the euro, shared ones), and countries
// whose prefix matches several codes (a fund code, an old peso) — the rest is "CH" → "CHF".
const BY_CURRENCY: Record<string, string> = {
  EUR: "AD AT AX BE BL CY DE EE ES FI FR GF GP GR HR IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM TF VA XK YT",
  USD: "AS BQ EC FM GU IO MH MP PR PW SV TC TL UM US VG VI",
  GBP: "GB GG GS IM JE",
  CHF: "CH LI",
  XOF: "BF BJ CI GW ML NE SN TG",
  XAF: "CF CG CM GA GQ TD",
  XCD: "AG AI DM GD KN LC MS VC",
  XPF: "NC PF WF",
  AUD: "AU CC CX HM KI NF NR TV",
  NZD: "CK NU NZ PN TK",
  NOK: "BV NO SJ",
  DKK: "DK FO GL",
  ANG: "CW SX",
  MAD: "EH MA",
  ILS: "IL PS",
  BOB: "BO",
  CLP: "CL",
  COP: "CO",
  CUP: "CU",
  MXN: "MX",
  UYU: "UY",
};

/** The ISO 4217 code a country pays in, or undefined when the browser knows none. */
export function currencyOf(country: string): string | undefined {
  const shared = Object.entries(BY_CURRENCY).find(([, countries]) =>
    countries.split(" ").includes(country),
  );
  if (shared) return shared[0];
  return Intl.supportedValuesOf("currency").find((code) =>
    code.startsWith(country),
  );
}
