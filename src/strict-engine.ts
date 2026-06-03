import type { SupportResistanceSnapshot } from './sr.types.js';
import type { SupportResistanceInput } from './sr-engine.js';

import { PermissiveSupportResistanceEngine } from './sr-engine.js';
import { SrErrors } from './sr-errors.js';
import {
  type SupportResistanceValidationOptions,
  resolveSupportResistanceValidationOptions,
  validateSupportResistanceInput,
} from './strict-validation.js';

export class SupportResistanceEngine {
  private readonly engine: PermissiveSupportResistanceEngine;
  private readonly validationOptions: SupportResistanceValidationOptions;

  constructor(
    validationOptions: SupportResistanceValidationOptions = {},
    engine = new PermissiveSupportResistanceEngine(),
  ) {
    this.validationOptions = validationOptions;
    this.engine = engine;
  }

  evaluate(
    input: SupportResistanceInput,
    validationOptions?: SupportResistanceValidationOptions,
  ): SupportResistanceSnapshot {
    const resolvedValidation = resolveSupportResistanceValidationOptions({
      ...this.validationOptions,
      ...validationOptions,
    });
    const issues = validateSupportResistanceInput(input, resolvedValidation);
    const blockingIssues = issues.filter((issue) => issue.severity === 'ERROR');
    if (blockingIssues.length > 0) {
      throw SrErrors.inputValidationFailed({ issues: blockingIssues });
    }

    return this.engine.evaluate(sanitizeInputForStrictEvaluation(input, resolvedValidation));
  }
}

function sanitizeInputForStrictEvaluation(
  input: SupportResistanceInput,
  validationOptions: Required<SupportResistanceValidationOptions>,
): SupportResistanceInput {
  if (
    validationOptions.allowLatestOpenCandleAsPriceContext &&
    input.candles.length > 0 &&
    input.candles[input.candles.length - 1]?.closed === false
  ) {
    return {
      ...input,
      candles: input.candles.slice(0, -1),
    };
  }

  return input;
}

export const StrictSupportResistanceEngine = SupportResistanceEngine;
