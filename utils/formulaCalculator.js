// Utility to safely evaluate formula strings with a variable 'Reading'
function calculateFormula(formula, reading) {
  if (typeof formula !== 'string' || formula.trim() === '') return reading;
  let result = reading;
  try {
    // Replace 'Reading' (case-insensitive) with the value
    const expr = formula.replace(/reading/gi, reading);
    // Only allow numbers, operators, parentheses, and decimal points
    if (!/^[-+*/().0-9\s]+$/.test(expr.replace(/reading/gi, ''))) {
      throw new Error('Unsafe formula');
    }
    // eslint-disable-next-line no-eval
    result = eval(expr);
  } catch (e) {
    result = reading; // fallback to input if error
  }
  return result;
}

module.exports = { calculateFormula };
