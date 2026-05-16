/**
 * Limpia una entrada numérica eliminando ceros a la izquierda innecesarios.
 * Si el valor actual es "0" y se ingresa un número (no un punto decimal), 
 * reemplaza el "0" por el nuevo valor.
 * 
 * @param currentValue - El valor actual en el estado.
 * @param newValue - El nuevo valor proveniente del evento onChange.
 * @returns La cadena limpia para guardar en el estado.
 */
export const cleanNumericInput = (currentValue: string, newValue: string): string => {
  // Si empezamos desde "0" y el nuevo valor tiene más de un dígito, 
  // y el segundo dígito no es un punto (para permitir 0.5), limpiamos los ceros.
  if (currentValue === "0" && newValue.length > 1 && newValue[1] !== ".") {
    return newValue.replace(/^0+/, '');
  }
  return newValue;
};