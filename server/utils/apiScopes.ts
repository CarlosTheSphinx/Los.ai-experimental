/**
 * API Scope Definitions & Management
 *
 * Defines all available scopes for API key access control.
 * Scopes follow a hierarchical pattern: resource:action
 *
 * Scope Features:
 * - Granular permissions per endpoint
 * - Wildcard support (* matches all)
 * - Scope dependencies (write implies read)
 * - Critical scope marking for sensitive operations
 */

export interface ScopeDefinition {
  scope: string;
  description: string;
  critical?: boolean; // Requires extra audit logging
  adminOnly?: boolean; // Only super_admin can grant
  impliedScopes?: string[]; // Other scopes this includes
}

export const API_SCOPES: Record<string, ScopeDefinition> = {
  // ============= Deal Management =============
  'deals:read': {
    scope: 'deals:read',
    description: 'Read deal information, lists, and details',
    impliedScopes: [],
  },
  'deals:write': {
    scope: 'deals:write',
    description: 'Create, modify, and update deals',
    impliedScopes: ['deals:read'],
  },
  'deals:delete': {
    scope: 'deals:delete',
    description: 'Delete deals (CRITICAL - requires audit logging)',
    critical: true,
    impliedScopes: ['deals:read'],
  },

  // ============= Document Management =============
  'documents:read': {
    scope: 'documents:read',
    description: 'Download, view, and list documents',
    impliedScopes: [],
  },
  'documents:write': {
    scope: 'documents:write',
    description: 'Upload, manage, and organize documents',
    impliedScopes: ['documents:read'],
  },
  'documents:sign': {
    scope: 'documents:sign',
    description: 'Execute e-signatures and signing workflows',
    critical: true,
    impliedScopes: ['documents:read'],
  },

  // ============= Borrower Profile Management =============
  'borrowers:read': {
    scope: 'borrowers:read',
    description: 'Access borrower profile information',
    impliedScopes: [],
  },
  'borrowers:write': {
    scope: 'borrowers:write',
    description: 'Create and modify borrower profiles',
    impliedScopes: ['borrowers:read'],
  },
  'borrowers:pii': {
    scope: 'borrowers:pii',
    description: 'Access sensitive PII (SSN, ID numbers, DOB)',
    critical: true,
    impliedScopes: ['borrowers:read'],
  },

  // ============= Financial Data =============
  'financials:read': {
    scope: 'financials:read',
    description: 'View financial statements and data',
    impliedScopes: [],
  },
  'financials:write': {
    scope: 'financials:write',
    description: 'Upload and modify financial documents',
    impliedScopes: ['financials:read'],
  },

  // ============= Reports & Exports =============
  'reports:read': {
    scope: 'reports:read',
    description: 'Generate and view reports',
    impliedScopes: [],
  },
  'reports:export': {
    scope: 'reports:export',
    description: 'Export data to CSV, Excel, or PDF (computationally expensive)',
    impliedScopes: ['reports:read'],
  },
  'reports:data_dump': {
    scope: 'reports:data_dump',
    description: 'Full data export for analytics/backup',
    critical: true,
    adminOnly: true,
    impliedScopes: ['reports:export'],
  },

  // ============= Webhooks =============
  'webhooks:read': {
    scope: 'webhooks:read',
    description: 'View webhook configuration and delivery logs',
    impliedScopes: [],
  },
  'webhooks:write': {
    scope: 'webhooks:write',
    description: 'Create and modify webhooks',
    impliedScopes: ['webhooks:read'],
  },
  'webhooks:manage': {
    scope: 'webhooks:manage',
    description: 'Full webhook management (create, delete, modify)',
    impliedScopes: ['webhooks:read', 'webhooks:write'],
  },

  // ============= User Management (Admin Only) =============
  'admin:users': {
    scope: 'admin:users',
    description: 'Create, modify, and delete user accounts',
    critical: true,
    adminOnly: true,
    impliedScopes: [],
  },
  'admin:roles': {
    scope: 'admin:roles',
    description: 'Manage user roles and permissions',
    critical: true,
    adminOnly: true,
    impliedScopes: [],
  },

  // ============= Audit & Compliance (Admin Only) =============
  'admin:audit': {
    scope: 'admin:audit',
    description: 'Access audit logs and compliance reports',
    critical: true,
    adminOnly: true,
    impliedScopes: [],
  },
  'admin:keys': {
    scope: 'admin:keys',
    description: 'Manage API keys for other users',
    critical: true,
    adminOnly: true,
    impliedScopes: [],
  },

  // ============= System (Admin Only) =============
  'admin:system': {
    scope: 'admin:system',
    description: 'System-level operations and configuration',
    critical: true,
    adminOnly: true,
    impliedScopes: [],
  },

  // ============= Wildcard =============
  '*': {
    scope: '*',
    description: 'Full access to all scopes (equivalent to super_admin)',
    critical: true,
    adminOnly: true,
    impliedScopes: [],
  },
};

/**
 * Get all implied scopes for a given scope
 *
 * Example: 'deals:write' implies 'deals:read'
 */
export function getScopeDependencies(scope: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [scope];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    const definition = API_SCOPES[current];
    if (definition?.impliedScopes) {
      queue.push(...definition.impliedScopes);
    }
  }

  visited.delete(scope); // Remove the original scope
  return visited;
}

/**
 * Expand scopes to include all implied scopes
 *
 * Example: ['deals:write'] becomes ['deals:write', 'deals:read']
 */
export function expandScopes(scopes: string[]): string[] {
  const expanded = new Set<string>(scopes);

  for (const scope of scopes) {
    const implied = getScopeDependencies(scope);
    implied.forEach((s) => expanded.add(s));
  }

  return Array.from(expanded);
}

/**
 * Validate that a scope is valid and exists
 */
export function isValidScope(scope: string): boolean {
  if (scope === '*') return true; // Wildcard always valid
  return scope in API_SCOPES;
}

/**
 * Validate multiple scopes
 */
export function areValidScopes(scopes: string[]): { valid: boolean; invalidScopes: string[] } {
  const invalid = scopes.filter((scope) => !isValidScope(scope));
  return {
    valid: invalid.length === 0,
    invalidScopes: invalid,
  };
}

/**
 * Get scopes that are critical (require audit logging)
 */
export function getCriticalScopes(scopes: string[]): string[] {
  return scopes.filter((scope) => {
    if (scope === '*') return true;
    const def = API_SCOPES[scope];
    return def?.critical === true;
  });
}

/**
 * Check if a user can grant a specific scope
 *
 * Rules:
 * - super_admin can grant any scope
 * - regular admin can grant non-critical, non-admin-only scopes
 * - user can only grant scopes they have
 */
export function canGrantScope(
  scope: string,
  userRole: 'super_admin' | 'admin' | 'user',
  userScopes: string[]
): boolean {
  if (userRole === 'super_admin') {
    return true;
  }

  const scopeDef = API_SCOPES[scope];
  if (!scopeDef) {
    return false;
  }

  // Reject critical and admin-only scopes for non-super-admins
  if (scopeDef.critical || scopeDef.adminOnly) {
    return false;
  }

  // User can only grant scopes they have
  if (userRole === 'user') {
    return userScopes.includes(scope) || userScopes.includes('*');
  }

  // Admin can grant non-critical, non-admin-only scopes
  return !scopeDef.adminOnly && !scopeDef.critical;
}

/**
 * Get rate limit for a scope
 *
 * Critical operations have lower rate limits
 */
export function getScopeRateLimit(scope: string, defaultLimit: number = 100): number {
  const scopeDef = API_SCOPES[scope];

  if (!scopeDef) {
    return defaultLimit;
  }

  // Critical scopes have lower rate limits
  if (scopeDef.critical) {
    return Math.floor(defaultLimit / 3); // ~33 requests/min for critical
  }

  return defaultLimit;
}

/**
 * Get all available scopes for a user to grant
 */
export function getGrantableScopes(userRole: 'super_admin' | 'admin' | 'user', userScopes: string[]): string[] {
  return Object.keys(API_SCOPES).filter((scope) => canGrantScope(scope, userRole, userScopes));
}

/**
 * Check if scope is a wildcard
 */
export function isWildcardScope(scope: string): boolean {
  return scope === '*' || scope.endsWith(':*');
}

/**
 * Get scope category
 *
 * Example: 'deals:read' → 'deals'
 */
export function getScopeCategory(scope: string): string | null {
  if (scope === '*') return null;
  const parts = scope.split(':');
  return parts.length >= 2 ? parts[0] : null;
}

/**
 * Filter scopes by category
 *
 * Example: getScopesByCategory('deals', scopes)
 */
export function getScopesByCategory(category: string, scopes: string[]): string[] {
  return scopes.filter((scope) => getScopeCategory(scope) === category);
}

/**
 * Get scope description
 */
export function getScopeDescription(scope: string): string {
  if (scope === '*') {
    return 'Full access to all scopes';
  }

  const def = API_SCOPES[scope];
  return def?.description || 'Unknown scope';
}

/**
 * Create summary of scopes
 *
 * Returns human-readable description of what scopes allow
 */
export function summarizeScopes(scopes: string[]): string {
  if (scopes.includes('*')) {
    return 'Full access to all APIs';
  }

  const categories = new Map<string | null, string[]>();

  for (const scope of scopes) {
    const category = getScopeCategory(scope);
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(scope);
  }

  const parts: string[] = [];

  for (const [category, categoryScopes] of categories) {
    if (category === null) continue;

    const actions = categoryScopes.map((scope) => scope.split(':')[1]).join(', ');
    parts.push(`${category}: ${actions}`);
  }

  return parts.join('; ') || 'No scopes granted';
}
