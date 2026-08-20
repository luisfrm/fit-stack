import { describe, expect, it } from 'vitest';
import { cleanNumericInput } from '../../lib/utils/helper';

describe('cleanNumericInput', () => {
  it('replaces leading zero when typing a digit after "0"', () => {
    expect(cleanNumericInput('0', '05')).toBe('5');
  });

  it('allows typing a decimal point after "0" (for 0.5)', () => {
    expect(cleanNumericInput('0', '0.')).toBe('0.');
  });

  it('does not strip zeros from values that are not starting from "0"', () => {
    expect(cleanNumericInput('10', '105')).toBe('105');
  });

  it('passes through single character values unchanged', () => {
    expect(cleanNumericInput('0', '0')).toBe('0');
    expect(cleanNumericInput('0', '3')).toBe('3');
  });

  it('handles empty new value', () => {
    expect(cleanNumericInput('0', '')).toBe('');
  });
});
