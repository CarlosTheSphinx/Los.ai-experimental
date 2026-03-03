import {
  generateAPIKey,
  validateAPIKey,
  maskAPIKey,
  extractAPIKeyFromHeader,
  isAPIKeyValid,
  validateScopes,
  scopeMatches,
} from '../apiKeys';
import { areValidScopes, expandScopes, getScopeDependencies, summarizeScopes } from '../apiScopes';

/**
 * API Key Management Tests
 *
 * Tests cover:
 * - Key generation and validation
 * - Scope management and validation
 * - Scope wildcard matching
 * - Key masking
 * - Header parsing
 */

describe('API Key Generation & Validation', () => {
  describe('generateAPIKey', () => {
    test('generates a valid API key', () => {
      const { plaintext, hash } = generateAPIKey();

      // Plaintext should start with sk_prod_
      expect(plaintext).toMatch(/^sk_prod_/);

      // Should have reasonable length
      expect(plaintext.length).toBeGreaterThan(20);

      // Hash should be a bcrypt hash
      expect(hash).toMatch(/^\$2[aby]\$/);
    });

    test('generates unique keys each time', () => {
      const key1 = generateAPIKey();
      const key2 = generateAPIKey();

      expect(key1.plaintext).not.toEqual(key2.plaintext);
      expect(key1.hash).not.toEqual(key2.hash);
    });
  });

  describe('validateAPIKey', () => {
    test('validates correct plaintext against hash', () => {
      const { plaintext, hash } = generateAPIKey();
      const isValid = validateAPIKey(plaintext, hash);

      expect(isValid).toBe(true);
    });

    test('rejects incorrect plaintext', () => {
      const { hash } = generateAPIKey();
      const wrongKey = 'sk_prod_invalid';

      expect(validateAPIKey(wrongKey, hash)).toBe(false);
    });

    test('is case-sensitive', () => {
      const { plaintext, hash } = generateAPIKey();
      const modifiedKey = plaintext.toUpperCase();

      expect(validateAPIKey(modifiedKey, hash)).toBe(false);
    });

    test('rejects invalid hash format', () => {
      const { plaintext } = generateAPIKey();
      const invalidHash = 'not-a-valid-hash';

      expect(validateAPIKey(plaintext, invalidHash)).toBe(false);
    });
  });

  describe('maskAPIKey', () => {
    test('shows only last 4 characters', () => {
      const key = 'sk_prod_abcdefgh12345678';
      const masked = maskAPIKey(key);

      expect(masked).toBe('...5678');
      expect(masked).not.toContain('abcd');
    });

    test('handles short keys', () => {
      const masked = maskAPIKey('abc');
      expect(masked).toBe('...');
    });

    test('handles empty string', () => {
      const masked = maskAPIKey('');
      expect(masked).toBe('...');
    });
  });

  describe('extractAPIKeyFromHeader', () => {
    test('extracts key from Bearer token format', () => {
      const key = 'sk_prod_abc123';
      const header = `Bearer ${key}`;

      expect(extractAPIKeyFromHeader(header)).toBe(key);
    });

    test('handles lowercase bearer', () => {
      const key = 'sk_prod_abc123';
      const header = `bearer ${key}`;

      expect(extractAPIKeyFromHeader(header)).toBe(key);
    });

    test('extracts raw key without Bearer', () => {
      const key = 'sk_prod_abc123';

      expect(extractAPIKeyFromHeader(key)).toBe(key);
    });

    test('returns null for missing header', () => {
      expect(extractAPIKeyFromHeader(undefined)).toBeNull();
      expect(extractAPIKeyFromHeader('')).toBeNull();
    });

    test('returns null for malformed header', () => {
      expect(extractAPIKeyFromHeader('Invalid Format Here')).toBeNull();
      expect(extractAPIKeyFromHeader('Bearer')).toBeNull();
    });
  });

  describe('isAPIKeyValid', () => {
    test('returns true for valid key', () => {
      const apiKey = {
        id: '123',
        userId: 'user1',
        name: 'Test Key',
        keyHash: 'hash',
        keyPreview: '...abc',
        scopes: ['deals:read'],
        rateLimitPerMinute: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(isAPIKeyValid(apiKey)).toBe(true);
    });

    test('returns false for revoked key', () => {
      const apiKey = {
        id: '123',
        userId: 'user1',
        name: 'Test Key',
        keyHash: 'hash',
        keyPreview: '...abc',
        scopes: ['deals:read'],
        rateLimitPerMinute: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedAt: new Date(),
      };

      expect(isAPIKeyValid(apiKey)).toBe(false);
    });

    test('returns false for expired key', () => {
      const apiKey = {
        id: '123',
        userId: 'user1',
        name: 'Test Key',
        keyHash: 'hash',
        keyPreview: '...abc',
        scopes: ['deals:read'],
        rateLimitPerMinute: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      expect(isAPIKeyValid(apiKey)).toBe(false);
    });

    test('returns true for not-yet-expired key', () => {
      const apiKey = {
        id: '123',
        userId: 'user1',
        name: 'Test Key',
        keyHash: 'hash',
        keyPreview: '...abc',
        scopes: ['deals:read'],
        rateLimitPerMinute: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // Expires in 1 hour
      };

      expect(isAPIKeyValid(apiKey)).toBe(true);
    });
  });
});

describe('Scope Management', () => {
  describe('validateScopes', () => {
    test('accepts exact scope match', () => {
      const result = validateScopes(['deals:read'], ['deals:read']);

      expect(result.valid).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });

    test('accepts multiple matching scopes', () => {
      const result = validateScopes(['deals:read', 'documents:write'], ['deals:read', 'documents:write']);

      expect(result.valid).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });

    test('rejects missing scope', () => {
      const result = validateScopes(['deals:delete'], ['deals:read']);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('deals:delete');
    });

    test('accepts wildcard for specific resource', () => {
      const result = validateScopes(['deals:read'], ['deals:*']);

      expect(result.valid).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });

    test('accepts global wildcard', () => {
      const result = validateScopes(['admin:users', 'deals:delete'], ['*']);

      expect(result.valid).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });

    test('rejects non-matching wildcard', () => {
      const result = validateScopes(['documents:read'], ['deals:*']);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('documents:read');
    });

    test('handles multiple required with partial match', () => {
      const result = validateScopes(['deals:read', 'documents:read'], ['deals:read']);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toEqual(['documents:read']);
    });
  });

  describe('scopeMatches', () => {
    test('single scope match', () => {
      expect(scopeMatches('deals:read', ['deals:read'])).toBe(true);
    });

    test('wildcard match', () => {
      expect(scopeMatches('deals:read', ['deals:*'])).toBe(true);
      expect(scopeMatches('deals:write', ['deals:*'])).toBe(true);
    });

    test('global wildcard match', () => {
      expect(scopeMatches('admin:users', ['*'])).toBe(true);
    });

    test('non-matching scopes', () => {
      expect(scopeMatches('documents:read', ['deals:read'])).toBe(false);
    });
  });

  describe('areValidScopes', () => {
    test('validates existing scopes', () => {
      const result = areValidScopes(['deals:read', 'documents:write']);

      expect(result.valid).toBe(true);
      expect(result.invalidScopes).toEqual([]);
    });

    test('rejects invalid scopes', () => {
      const result = areValidScopes(['deals:read', 'invalid:scope', 'foo:bar']);

      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toContain('invalid:scope');
      expect(result.invalidScopes).toContain('foo:bar');
    });

    test('accepts wildcard scope', () => {
      const result = areValidScopes(['*']);

      expect(result.valid).toBe(true);
    });
  });

  describe('getScopeDependencies', () => {
    test('write scope implies read', () => {
      const deps = getScopeDependencies('deals:write');

      expect(deps.has('deals:read')).toBe(true);
    });

    test('delete scope implies read', () => {
      const deps = getScopeDependencies('deals:delete');

      expect(deps.has('deals:read')).toBe(true);
    });

    test('read scope has no dependencies', () => {
      const deps = getScopeDependencies('deals:read');

      expect(deps.size).toBe(0);
    });

    test('handles deep dependencies', () => {
      const deps = getScopeDependencies('reports:data_dump');

      expect(deps.has('reports:export')).toBe(true);
      expect(deps.has('reports:read')).toBe(true);
    });
  });

  describe('expandScopes', () => {
    test('expands single scope with dependencies', () => {
      const expanded = expandScopes(['deals:write']);

      expect(expanded).toContain('deals:write');
      expect(expanded).toContain('deals:read');
    });

    test('handles multiple scopes', () => {
      const expanded = expandScopes(['deals:write', 'documents:sign']);

      expect(expanded).toContain('deals:write');
      expect(expanded).toContain('deals:read');
      expect(expanded).toContain('documents:sign');
      expect(expanded).toContain('documents:read');
    });

    test('removes duplicates', () => {
      const expanded = expandScopes(['deals:write', 'deals:read']);

      expect(expanded.filter((s) => s === 'deals:read')).toHaveLength(1);
    });
  });

  describe('summarizeScopes', () => {
    test('summarizes single scope', () => {
      const summary = summarizeScopes(['deals:read']);

      expect(summary).toContain('deals');
      expect(summary).toContain('read');
    });

    test('summarizes multiple scopes', () => {
      const summary = summarizeScopes(['deals:read', 'deals:write', 'documents:read']);

      expect(summary).toContain('deals');
      expect(summary).toContain('documents');
    });

    test('handles wildcard', () => {
      const summary = summarizeScopes(['*']);

      expect(summary).toContain('Full access');
    });

    test('handles empty scopes', () => {
      const summary = summarizeScopes([]);

      expect(summary).toBe('No scopes granted');
    });
  });
});

describe('Real-world Scenarios', () => {
  test('API key workflow: create, validate, use', () => {
    const { plaintext, hash } = generateAPIKey();

    // Simulate key creation
    expect(plaintext).toMatch(/^sk_prod_/);

    // Validate during authentication
    const isValid = validateAPIKey(plaintext, hash);
    expect(isValid).toBe(true);

    // Mask for display
    const masked = maskAPIKey(plaintext);
    expect(masked).toMatch(/^\.\.\./);
  });

  test('Scope validation for different user roles', () => {
    const adminScopes = ['*'];
    const userScopes = ['deals:read', 'documents:read'];
    const restrictedScopes = ['deals:read'];

    // Admin can access everything
    expect(validateScopes(['admin:users'], adminScopes).valid).toBe(true);

    // User can access deals and documents
    expect(validateScopes(['deals:read'], userScopes).valid).toBe(true);
    expect(validateScopes(['documents:read'], userScopes).valid).toBe(true);

    // User cannot access admin
    expect(validateScopes(['admin:users'], userScopes).valid).toBe(false);

    // Restricted user can only read deals
    expect(validateScopes(['deals:read'], restrictedScopes).valid).toBe(true);
    expect(validateScopes(['deals:write'], restrictedScopes).valid).toBe(false);
  });

  test('Wildcard scope matching edge cases', () => {
    // Exact match
    expect(validateScopes(['deals:read'], ['deals:read']).valid).toBe(true);

    // Wildcard matches resource action
    expect(validateScopes(['deals:write'], ['deals:*']).valid).toBe(true);

    // Global wildcard matches anything
    expect(validateScopes(['anything:here'], ['*']).valid).toBe(true);

    // Non-matching wildcard
    expect(validateScopes(['documents:read'], ['deals:*']).valid).toBe(false);
  });

  test('Key expiration scenarios', () => {
    const now = new Date();

    // Valid key (no expiration)
    const validKey = {
      id: '1',
      userId: 'u1',
      name: 'Valid',
      keyHash: 'h',
      keyPreview: 'p',
      scopes: [],
      rateLimitPerMinute: 100,
      createdAt: now,
      updatedAt: now,
    };

    expect(isAPIKeyValid(validKey)).toBe(true);

    // Valid key with future expiration
    const futureKey = { ...validKey, expiresAt: new Date(now.getTime() + 1000) };
    expect(isAPIKeyValid(futureKey)).toBe(true);

    // Expired key
    const expiredKey = { ...validKey, expiresAt: new Date(now.getTime() - 1000) };
    expect(isAPIKeyValid(expiredKey)).toBe(false);

    // Revoked key
    const revokedKey = { ...validKey, revokedAt: new Date(now.getTime() - 1000) };
    expect(isAPIKeyValid(revokedKey)).toBe(false);
  });
});

describe('Security Tests', () => {
  test('API keys are not stored in plaintext', () => {
    const { plaintext, hash } = generateAPIKey();

    // Hash should not contain plaintext
    expect(hash).not.toContain(plaintext.slice(-10));

    // Different plaintext should not match hash
    const wrongKey = plaintext.replace(/.$/, 'X');
    expect(validateAPIKey(wrongKey, hash)).toBe(false);
  });

  test('Scope boundaries prevent privilege escalation', () => {
    const userScopes = ['deals:read'];

    // User cannot escalate to write
    expect(validateScopes(['deals:write'], userScopes).valid).toBe(false);

    // User cannot escalate to admin
    expect(validateScopes(['admin:users'], userScopes).valid).toBe(false);

    // User cannot use wildcard
    expect(validateScopes(['*'], userScopes).valid).toBe(false);
  });

  test('Scope wildcards are correctly scoped', () => {
    // deals:* should NOT match documents
    expect(scopeMatches('documents:read', ['deals:*'])).toBe(false);

    // Global * should match everything
    expect(scopeMatches('anything:here', ['*'])).toBe(true);
  });
});

describe('Performance', () => {
  test('key generation completes quickly', () => {
    const start = performance.now();

    for (let i = 0; i < 10; i++) {
      generateAPIKey();
    }

    const duration = performance.now() - start;

    // 10 key generations should complete in under 1 second
    expect(duration).toBeLessThan(1000);
  });

  test('key validation completes quickly', () => {
    const { plaintext, hash } = generateAPIKey();

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      validateAPIKey(plaintext, hash);
    }

    const duration = performance.now() - start;

    // 100 validations should complete in under 100ms
    expect(duration).toBeLessThan(100);
  });

  test('scope matching is fast', () => {
    const scopes = ['deals:read', 'deals:write', 'documents:*', 'admin:users'];

    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      validateScopes(['deals:write'], scopes);
    }

    const duration = performance.now() - start;

    // 1000 scope validations should complete in under 50ms
    expect(duration).toBeLessThan(50);
  });
});
