/**
 * Cleans a numeric input string by removing unnecessary leading zeros.
 * If the current value is "0" and a digit is entered (not a decimal point),
 * it replaces the "0" with the new value.
 * 
 * @param currentValue - The current value in state.
 * @param newValue - The new value from the onChange event.
 * @returns The cleaned string to save in state.
 */
export const cleanNumericInput = (currentValue: string, newValue: string): string => {
  // If starting from "0" and the new value has more than one digit,
  // and the second digit is not a decimal point (to allow 0.5), trim leading zeros.
  if (currentValue === "0" && newValue.length > 1 && newValue[1] !== ".") {
    return newValue.replace(/^0+/, '');
  }
  return newValue;
};