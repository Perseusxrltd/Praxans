import data from "./data/elements.json";
import type { ElementMass } from "./types";

export const ELEMENTS = Object.freeze(
  data.map((element) => Object.freeze(element)),
);
export const ELEMENT_BY_SYMBOL = Object.freeze(
  Object.fromEntries(ELEMENTS.map((e) => [e.symbol, e])),
);

type ElementTerms = {
  readonly symbols: readonly string[];
  readonly fractions: readonly number[];
  readonly total: number;
};
const constantTerms = new WeakMap<ElementMass, ElementTerms>();

/** Compile constant compositions once, preserving own-property and sum order. */
export function freezeElements<T extends ElementMass>(mass: T): Readonly<T> {
  Object.freeze(mass);
  const symbols = Object.keys(mass),
    fractions: number[] = [];
  let total = 0;
  for (const symbol of symbols) {
    const property = Object.getOwnPropertyDescriptor(mass, symbol)!;
    // A frozen accessor can still change its result; never cache such a value.
    if (!("value" in property) || typeof property.value !== "number")
      return mass;
    fractions.push(property.value);
    total += property.value;
  }
  constantTerms.set(
    mass,
    Object.freeze({
      symbols: Object.freeze(symbols),
      fractions: Object.freeze(fractions),
      total,
    }),
  );
  return mass;
}
export const elementTerms = (mass: ElementMass): ElementTerms | undefined =>
  constantTerms.get(mass);

/** Counts atoms in a formula, including nested parentheses. No invented element names. */
export function atoms(formula: string): ElementMass {
  const tokens = formula.match(/[A-Z][a-z]?|\d+|[()]/g);
  if (!tokens?.length || tokens.join("") !== formula)
    throw new Error("Invalid chemical formula.");
  let i = 0;
  const group = (nested = false): ElementMass => {
    const result: ElementMass = {};
    while (i < tokens.length && tokens[i] !== ")") {
      let part: ElementMass;
      if (tokens[i] === "(") {
        i++;
        part = group(true);
      } else {
        const symbol = tokens[i++];
        if (!ELEMENT_BY_SYMBOL[symbol]) throw new Error("Unknown element.");
        part = { [symbol]: 1 };
      }
      const count = /^\d+$/.test(tokens[i] ?? "") ? Number(tokens[i++]) : 1;
      if (!Number.isSafeInteger(count) || count < 1 || count > 100000)
        throw new Error("Invalid atom count.");
      for (const [symbol, number] of Object.entries(part))
        result[symbol] = (result[symbol] ?? 0) + number * count;
    }
    if (nested) {
      if (tokens[i++] !== ")") throw new Error("Unclosed chemical group.");
    }
    return result;
  };
  const result = group();
  if (i !== tokens.length || !Object.keys(result).length)
    throw new Error("Invalid chemical group.");
  return result;
}
export const molarMass = (formula: string) =>
  Object.entries(atoms(formula)).reduce(
    (sum, [symbol, count]) =>
      sum + ELEMENT_BY_SYMBOL[symbol].atomic_mass * count,
    0,
  );
export function composition(formula: string): ElementMass {
  const counts = atoms(formula),
    total = molarMass(formula);
  return Object.fromEntries(
    Object.entries(counts).map(([symbol, count]) => [
      symbol,
      (count * ELEMENT_BY_SYMBOL[symbol].atomic_mass) / total,
    ]),
  );
}
export function addElements(
  target: ElementMass,
  source: ElementMass,
  amount = 1,
): void {
  const terms = constantTerms.get(source);
  if (terms) {
    for (let i = 0; i < terms.symbols.length; i++) {
      const symbol = terms.symbols[i];
      target[symbol] = (target[symbol] ?? 0) + terms.fractions[i] * amount;
    }
    return;
  }
  // Keep enumeration order and own-property semantics without allocating a pair
  // for every element on every soil/plant exchange.
  for (const symbol in source)
    if (Object.hasOwn(source, symbol))
      target[symbol] = (target[symbol] ?? 0) + source[symbol] * amount;
}
export function totalElements(mass: ElementMass): number {
  const terms = constantTerms.get(mass);
  if (terms) return terms.total;
  let sum = 0;
  for (const symbol in mass)
    if (Object.hasOwn(mass, symbol)) sum += mass[symbol];
  return sum;
}
export function normalize(mass: ElementMass): ElementMass {
  const total = totalElements(mass);
  return Object.fromEntries(
    Object.entries(mass).map(([symbol, value]) => [symbol, value / total]),
  );
}
/** Equilibrium phase at approximately one atmosphere; unknown reference points stay unknown. */
export function elementPhase(
  symbol: string,
  kelvin: number,
): "solid" | "liquid" | "gas" | "unknown" {
  const element = ELEMENT_BY_SYMBOL[symbol];
  if (
    !element ||
    !Number.isFinite(kelvin) ||
    kelvin < 0 ||
    element.melt === null ||
    element.boil === null
  )
    return "unknown";
  // Helium does not solidify at ordinary pressure.
  if (symbol === "He") return kelvin >= element.boil ? "gas" : "liquid";
  return kelvin >= element.boil
    ? "gas"
    : kelvin >= element.melt
      ? "liquid"
      : "solid";
}
