/**
 * Form input helpers shared by the Panel and the Console.
 */

/**
 * Cleans a numeric input string by removing unnecessary leading zeros.
 *
 * When the current value is "0" and the user types a digit (not a decimal
 * point), the zero is replaced instead of producing "05". Typing "0." is
 * allowed so values like 0.5 can be entered.
 *
 * @param currentValue Current value held in state.
 * @param newValue     Value coming from the input's onChange event.
 * @returns The cleaned string to store in state.
 */
export function cleanNumericInput(
  currentValue: string,
  newValue: string,
): string {
  if (currentValue === "0" && newValue.length > 1 && newValue[1] !== ".") {
    return newValue.replace(/^0+/, "");
  }
  return newValue;
}
