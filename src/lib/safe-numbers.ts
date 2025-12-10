/**
 * Safe Number Utilities
 * Prevents NaN errors across the application
 * All functions return valid numbers, never NaN or undefined
 */

/**
 * Safely parse a value to a number
 * Returns 0 for null, undefined, NaN, or invalid inputs
 *
 * @param value - Any value to parse
 * @param fallback - Optional fallback value (default: 0)
 * @returns Valid number
 */
export function safeParseFloat(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'number') {
    return isNaN(value) || !isFinite(value) ? fallback : value;
  }

  if (typeof value === 'string') {
    // Remove commas and whitespace
    const cleaned = value.replace(/,/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return fallback;
}

/**
 * Safely parse a value to an integer
 * Returns 0 for null, undefined, NaN, or invalid inputs
 *
 * @param value - Any value to parse
 * @param fallback - Optional fallback value (default: 0)
 * @returns Valid integer
 */
export function safeParseInt(value: unknown, fallback: number = 0): number {
  const num = safeParseFloat(value, fallback);
  return Math.floor(num);
}

/**
 * Safely format a number for display
 * Returns "0.00" for invalid inputs
 *
 * @param value - Value to format
 * @param decimals - Number of decimal places (default: 2)
 * @param fallback - Fallback display string (default: "0.00")
 * @returns Formatted string
 */
export function safeFormatNumber(
  value: unknown,
  decimals: number = 2,
  fallback: string = '0.00'
): string {
  const num = safeParseFloat(value);
  if (num === 0 && value !== 0 && value !== '0') {
    // Value was invalid, return fallback
    return fallback;
  }
  return num.toFixed(decimals);
}

/**
 * Safely format a currency amount
 * Returns "$0.00" for invalid inputs
 *
 * @param value - Value to format
 * @param currency - Currency symbol (default: "$")
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string
 */
export function safeFormatCurrency(
  value: unknown,
  currency: string = '$',
  decimals: number = 2
): string {
  const num = safeParseFloat(value);
  return `${currency}${num.toFixed(decimals)}`;
}

/**
 * Safely format a token amount
 * Uses appropriate decimals based on token type
 *
 * @param value - Value to format
 * @param token - Token symbol (affects decimal places)
 * @returns Formatted token amount
 */
export function safeFormatTokenAmount(
  value: unknown,
  token: string
): string {
  const num = safeParseFloat(value);

  // Stablecoins use 2 decimals, others use more
  const isStable = ['USDT', 'USDC', 'USD1', 'WUSD', 'XUSD', 'BUSD', 'DAI'].includes(
    token.toUpperCase()
  );
  const decimals = isStable ? 2 : 6;

  // Remove trailing zeros for cleaner display
  const formatted = num.toFixed(decimals);
  return formatted.replace(/\.?0+$/, '') || '0';
}

/**
 * Safely divide two numbers
 * Returns 0 if divisor is 0 or invalid
 *
 * @param numerator - Value to divide
 * @param denominator - Value to divide by
 * @param fallback - Fallback value if division fails (default: 0)
 * @returns Result of division or fallback
 */
export function safeDivide(
  numerator: unknown,
  denominator: unknown,
  fallback: number = 0
): number {
  const num = safeParseFloat(numerator);
  const denom = safeParseFloat(denominator);

  if (denom === 0) {
    return fallback;
  }

  const result = num / denom;
  return isNaN(result) || !isFinite(result) ? fallback : result;
}

/**
 * Safely multiply two numbers
 *
 * @param a - First value
 * @param b - Second value
 * @returns Product or 0 if invalid
 */
export function safeMultiply(a: unknown, b: unknown): number {
  const numA = safeParseFloat(a);
  const numB = safeParseFloat(b);
  const result = numA * numB;
  return isNaN(result) || !isFinite(result) ? 0 : result;
}

/**
 * Safely get token decimals
 * Returns 18 for unknown tokens (common default)
 *
 * @param decimals - Decimals value from token/contract
 * @returns Valid decimals number
 */
export function safeGetDecimals(decimals: unknown): number {
  const num = safeParseInt(decimals, 18);
  // Reasonable range for token decimals
  if (num < 0 || num > 36) {
    return 18;
  }
  return num;
}

/**
 * Safely convert from wei to token units
 *
 * @param weiValue - Value in wei/smallest unit
 * @param decimals - Token decimals
 * @returns Value in token units
 */
export function safeFromWei(weiValue: unknown, decimals: unknown): number {
  const wei = safeParseFloat(weiValue);
  const dec = safeGetDecimals(decimals);
  return safeDivide(wei, Math.pow(10, dec));
}

/**
 * Safely convert from token units to wei
 *
 * @param tokenValue - Value in token units
 * @param decimals - Token decimals
 * @returns Value in wei/smallest unit
 */
export function safeToWei(tokenValue: unknown, decimals: unknown): number {
  const value = safeParseFloat(tokenValue);
  const dec = safeGetDecimals(decimals);
  return safeMultiply(value, Math.pow(10, dec));
}

/**
 * Check if a value is a valid number
 *
 * @param value - Value to check
 * @returns true if valid number, false otherwise
 */
export function isValidNumber(value: unknown): value is number {
  if (typeof value !== 'number') return false;
  return !isNaN(value) && isFinite(value);
}

/**
 * Safely clamp a number between min and max
 *
 * @param value - Value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Clamped value
 */
export function safeClamp(value: unknown, min: number, max: number): number {
  const num = safeParseFloat(value);
  return Math.max(min, Math.min(max, num));
}

/**
 * Safely calculate percentage
 *
 * @param part - The part value
 * @param total - The total value
 * @returns Percentage (0-100) or 0 if invalid
 */
export function safePercentage(part: unknown, total: unknown): number {
  const p = safeParseFloat(part);
  const t = safeParseFloat(total);
  return safeDivide(p * 100, t, 0);
}

// Export a convenient object with all utilities
export const SafeNumbers = {
  parse: safeParseFloat,
  parseInt: safeParseInt,
  format: safeFormatNumber,
  currency: safeFormatCurrency,
  token: safeFormatTokenAmount,
  divide: safeDivide,
  multiply: safeMultiply,
  decimals: safeGetDecimals,
  fromWei: safeFromWei,
  toWei: safeToWei,
  isValid: isValidNumber,
  clamp: safeClamp,
  percentage: safePercentage,
};

export default SafeNumbers;
