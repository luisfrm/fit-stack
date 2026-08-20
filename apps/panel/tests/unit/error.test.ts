import { describe, expect, it } from 'vitest';
import { formatApiErrorMessage, getErrorMessage } from '../../lib/utils/error';

describe('formatApiErrorMessage', () => {
  it('returns null for non-object input', () => {
    expect(formatApiErrorMessage(null)).toBeNull();
    expect(formatApiErrorMessage(undefined)).toBeNull();
    expect(formatApiErrorMessage('string')).toBeNull();
  });

  it('formats Zod issues with custom Spanish messages', () => {
    const data = {
      error: {
        issues: [
          { message: 'El nombre es requerido', path: ['name'] },
        ],
      },
    };
    expect(formatApiErrorMessage(data)).toBe('El nombre es requerido');
  });

  it('formats Zod issues with "Required" message to Spanish', () => {
    const data = {
      error: {
        issues: [
          { message: 'Required', path: ['email'] },
        ],
      },
    };
    expect(formatApiErrorMessage(data)).toContain('Correo electrónico');
  });

  it('formats multiple issues into a single string', () => {
    const data = {
      error: {
        issues: [
          { message: 'Required', path: ['firstName'] },
          { message: 'Required', path: ['lastName'] },
        ],
      },
    };
    const result = formatApiErrorMessage(data);
    expect(result).toContain('Nombre');
    expect(result).toContain('Apellido');
  });

  it('extracts message from error.message', () => {
    const data = { error: { message: 'Server error occurred' } };
    expect(formatApiErrorMessage(data)).toBe('Server error occurred');
  });

  it('extracts message from error string', () => {
    const data = { error: 'Simple error string' };
    expect(formatApiErrorMessage(data)).toBe('Simple error string');
  });

  it('extracts message from message field', () => {
    const data = { message: 'Direct message' };
    expect(formatApiErrorMessage(data)).toBe('Direct message');
  });
});

describe('getErrorMessage', () => {
  it('returns fallback for null/undefined', () => {
    expect(getErrorMessage(null)).toBe('Algo salió mal');
    expect(getErrorMessage(undefined)).toBe('Algo salió mal');
  });

  it('returns string errors directly', () => {
    expect(getErrorMessage('network timeout')).toBe('network timeout');
  });

  it('extracts from error.data.error', () => {
    const error = { data: { error: 'Not found' } };
    expect(getErrorMessage(error)).toBe('Not found');
  });

  it('extracts from error.message', () => {
    const error = { message: 'Something broke' };
    expect(getErrorMessage(error)).toBe('Something broke');
  });

  it('uses custom fallback', () => {
    expect(getErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });

  it('returns message even if it looks like [object Object]', () => {
    const error = { message: '[object Object]' };
    const result = getErrorMessage(error);
    // The function returns whatever .message contains — this is the current
    // behavior. If a guard is added later, this test should be updated.
    expect(result).toBe('[object Object]');
  });
});
