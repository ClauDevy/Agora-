import { describe, it, expect } from 'vitest';
import { HeuristicExtractor } from './extractor';
import { UNCLEAR } from '@/core/types';

const ex = new HeuristicExtractor();

describe('HeuristicExtractor — yes_no', () => {
  const field = { key: 'odor', type: 'yes_no' as const };

  it('maps clear affirmations to yes', async () => {
    expect(await ex.extract('Yes, it does', field)).toBe('yes');
    expect(await ex.extract('opo', field)).toBe('yes');
    expect(await ex.extract('oo naman', field)).toBe('yes');
  });

  it('maps clear negations to no', async () => {
    expect(await ex.extract('No, not at all', field)).toBe('no');
    expect(await ex.extract('hindi po', field)).toBe('no');
    expect(await ex.extract('wala', field)).toBe('no');
  });

  it('returns unclear when ambiguous or empty', async () => {
    expect(await ex.extract('yes and no', field)).toBe(UNCLEAR);
    expect(await ex.extract('maybe, I think', field)).toBe(UNCLEAR);
    expect(await ex.extract('', field)).toBe(UNCLEAR);
  });
});

describe('HeuristicExtractor — number', () => {
  const field = { key: 'pain', type: 'number' as const };

  it('parses digits', async () => {
    expect(await ex.extract('about 8 I guess', field)).toBe(8);
    expect(await ex.extract('0', field)).toBe(0);
  });

  it('parses spoken number words', async () => {
    expect(await ex.extract('maybe eight', field)).toBe(8);
    expect(await ex.extract('ten', field)).toBe(10);
  });

  it('returns unclear when no number is present', async () => {
    expect(await ex.extract('it hurts a lot', field)).toBe(UNCLEAR);
    expect(await ex.extract('', field)).toBe(UNCLEAR);
  });
});

describe('HeuristicExtractor — validation guard', () => {
  it('never returns a value outside the declared type', async () => {
    // A number utterance against a yes_no field must not leak a number.
    const r = await ex.extract('8', { key: 'odor', type: 'yes_no' });
    expect(r).toBe(UNCLEAR);
  });
});
