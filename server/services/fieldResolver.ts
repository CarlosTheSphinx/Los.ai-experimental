/**
 * Shared field-resolution helpers used by both the External-URL scraper flow
 * and the Direct-API (NQX) flow. Pure functions — no I/O, no side-effects.
 */

export interface ConditionalRule {
  operator: '>=' | '>' | '<=' | '<' | '==' | 'between';
  value: string;
  value2?: string;
  /** Opaque option identifier — caller decides whether this is a label, optionId, etc. */
  option: string;
}

/**
 * Evaluate a `{varName}` template formula against a loanData bag.
 * Returns null on parse failure or non-finite result.
 *
 * Whitelist: only digits, math operators, parens, dots, and whitespace are
 * allowed in the substituted expression — anything else means a variable
 * resolved to a non-numeric string and we abort to avoid eval-injection.
 */
export function evaluateFormula(
  formula: string,
  loanData: Record<string, any>,
): number | null {
  if (!formula || typeof formula !== 'string') return null;
  try {
    const substituted = formula.replace(/\{([^}]+)\}/g, (_, varName: string) => {
      const v = loanData?.[varName];
      const n = Number(v);
      return isNaN(n) ? '0' : String(n);
    });
    if (!/^[\d\s+\-*/().eE,]*$/.test(substituted)) return null;
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + substituted + ')')();
    const n = Number(result);
    return isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Walk conditional rules top-to-bottom; return the first matching rule's
 * `option` value, or `fallback` if none match. `numResult` is what the
 * formula evaluated to.
 */
export function matchConditionalRules(
  numResult: number,
  rules: ConditionalRule[] | undefined,
  fallback?: string,
): string | null {
  if (!isFinite(numResult)) return fallback ?? null;
  if (!rules || !rules.length) return fallback ?? null;
  for (const rule of rules) {
    const v1 = parseFloat(rule.value);
    if (isNaN(v1)) continue;
    switch (rule.operator) {
      case '<=':
        if (numResult <= v1) return rule.option;
        break;
      case '<':
        if (numResult < v1) return rule.option;
        break;
      case '>=':
        if (numResult >= v1) return rule.option;
        break;
      case '>':
        if (numResult > v1) return rule.option;
        break;
      case '==':
        if (numResult === v1) return rule.option;
        break;
      case 'between': {
        const v2 = parseFloat(rule.value2 || '');
        if (!isNaN(v2) && numResult >= v1 && numResult <= v2) return rule.option;
        break;
      }
    }
  }
  return fallback ?? null;
}
