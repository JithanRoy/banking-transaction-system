const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

const assertCents = (cents, { allowZero, fieldName }) => {
  if (!allowZero && cents <= 0n) {
    throw new Error(`${fieldName} must be greater than 0`);
  }

  if (allowZero && cents < 0n) {
    throw new Error(`${fieldName} must be a non-negative amount`);
  }
};

export const toCents = (
  value,
  { allowZero = false, fieldName = "amount" } = {},
) => {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!MONEY_PATTERN.test(trimmed)) {
      throw new Error(`${fieldName} must be a valid monetary amount with up to 2 decimal places`);
    }

    const [wholePart, fractionPart = ""] = trimmed.split(".");
    const cents = BigInt(wholePart) * 100n + BigInt((fractionPart + "00").slice(0, 2));
    assertCents(cents, { allowZero, fieldName });
    return cents;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} must be a finite number`);
    }

    const scaled = value * 100;
    const rounded = Math.round(scaled);

    if (Math.abs(scaled - rounded) > 1e-8) {
      throw new Error(`${fieldName} must have at most 2 decimal places`);
    }

    const cents = BigInt(rounded);
    assertCents(cents, { allowZero, fieldName });
    return cents;
  }

  throw new Error(`${fieldName} must be a number or numeric string`);
};

export const centsToNumericString = (cents) => {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");

  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
};

export const centsToNumber = (cents) => Number(centsToNumericString(cents));
