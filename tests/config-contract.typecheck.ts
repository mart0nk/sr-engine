import type { ZoneConstructionPolicy } from '../src/index.js';

const stablePolicy: ZoneConstructionPolicy = 'WICK_TO_BODY';
void stablePolicy;

// @ts-expect-error stable API no longer advertises unsupported construction policies
const unsupportedPolicy: ZoneConstructionPolicy = 'FULL_CANDLE';
void unsupportedPolicy;
