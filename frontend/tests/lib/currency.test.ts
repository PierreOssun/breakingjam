import { currencyOf } from "../../src/lib/currency";

describe("currencyOf", () => {
  it("knows the currencies countries share and the ones named after them", () => {
    expect(currencyOf("CH")).toBe("CHF");
    expect(currencyOf("LI")).toBe("CHF");
    expect(currencyOf("FR")).toBe("EUR");
    expect(currencyOf("SN")).toBe("XOF");
    expect(currencyOf("KR")).toBe("KRW");
    expect(currencyOf("JP")).toBe("JPY");
    // A fund code or an old peso starts with the country too: the everyday one wins.
    expect(currencyOf("MX")).toBe("MXN");
    expect(currencyOf("US")).toBe("USD");
  });

  it("suggests nothing for a country it can't tell", () => {
    expect(currencyOf("AQ")).toBeUndefined();
  });
});
