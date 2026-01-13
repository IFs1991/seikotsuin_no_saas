# Tenant Table API Guard Spec v0.1

## Overview
- Purpose: Remove direct client Supabase access and enforce server-side guards for tenant tables.
- DoD: DOD-09 (docs/stabilization/DoD-v0.1.md).
- One task = one PR.
- Priority: **Critical**
- Risk: **Tenant isolation violation - direct DB access bypasses server-side authorization**

## Evidence (Current Behavior)

### Direct Supabase Access from Services

| File | Issue | Lines |
|------|-------|-------|
| src/lib/services/block-service.ts | `createClient()` + `from('blocks')` direct access | 6, 34, 54, 84, 114, 139, 160, 185 |
| src/lib/services/reservation-service.ts | `from('reservations')` and `from('blocks')` direct access | 36, 55, 77, 94, 109, 210, 253, 269, 285, 301, 318, 336, 351, 366, 436 |

### Missing clinic_id Enforcement

```typescript
// Current: block-service.ts
async createBlock(data: CreateBlockData): Promise<Block> {
  const supabase = await this.getSupabase();
  // No clinic_id validation!
  const { data: result, error } = await supabase
    .from('blocks')
    .insert(blockData)  // Can insert to any clinic
    .select()
    .single();
}
```

### Security Risk Analysis

1. **RLS Bypass Risk**: Client-side Supabase uses user's JWT token. If token is compromised or roles are misconfigured, attacker can access all data.
2. **No Server-Side Audit**: Direct client access doesn't go through `ensureClinicAccess()` or `AuditLogger`.
3. **Inconsistent Authorization**: Some routes use `ensureClinicAccess()`, others use direct Supabase.

## Tenant Tables Requiring API Guards

| Table | Current Access | Required Change |
|-------|----------------|-----------------|
| blocks | BlockService (client) | /api/blocks with ensureClinicAccess |
| reservations | ReservationService (client) + /api/reservations | Consolidate to /api/reservations |
| customers | /api/customers | Already protected (verify) |
| menus | Direct access in components | Add /api/menus |
| resources | Direct access | Add /api/resources |

## Plan

### 1. Create /api/blocks route with clinic guards (Priority: P0)

Create `src/app/api/blocks/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { z } from 'zod';

const BlockCreateSchema = z.object({
  clinic_id: z.string().uuid(),
  resource_id: z.string().uuid().optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  reason: z.string().optional(),
  recurrence_rule: z.string().optional(),
});

const BlockUpdateSchema = BlockCreateSchema.partial().extend({
  id: z.string().uuid(),
});

/**
 * GET /api/blocks
 * List blocks for a clinic within a date range
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinic_id');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  if (!clinicId) {
    return createErrorResponse('clinic_id is required', 400);
  }

  try {
    const { supabase } = await ensureClinicAccess(
      request,
      '/api/blocks',
      clinicId,
      { allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'] }
    );

    let query = supabase
      .from('blocks')
      .select('*')
      .eq('clinic_id', clinicId);

    if (startDate) {
      query = query.gte('start_time', startDate);
    }
    if (endDate) {
      query = query.lte('end_time', endDate);
    }

    const { data, error } = await query.order('start_time', { ascending: true });

    if (error) {
      return createErrorResponse(error.message, 500);
    }

    return createSuccessResponse({ blocks: data });
  } catch (error) {
    return createErrorResponse('Unauthorized', 401);
  }
}

/**
 * POST /api/blocks
 * Create a new block
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BlockCreateSchema.safeParse(body);

    if (!parsed.success) {
      return createErrorResponse(parsed.error.message, 400);
    }

    const { clinic_id, ...blockData } = parsed.data;

    const { supabase, user } = await ensureClinicAccess(
      request,
      '/api/blocks',
      clinic_id,
      { allowedRoles: ['admin', 'clinic_admin', 'manager'] }
    );

    const { data, error } = await supabase
      .from('blocks')
      .insert({
        ...blockData,
        clinic_id,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return createErrorResponse(error.message, 500);
    }

    return createSuccessResponse({ block: data }, 201);
  } catch (error) {
    return createErrorResponse('Unauthorized', 401);
  }
}

/**
 * PUT /api/blocks
 * Update an existing block
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BlockUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return createErrorResponse(parsed.error.message, 400);
    }

    const { id, clinic_id, ...updates } = parsed.data;

    if (!clinic_id) {
      return createErrorResponse('clinic_id is required', 400);
    }

    const { supabase } = await ensureClinicAccess(
      request,
      '/api/blocks',
      clinic_id,
      { allowedRoles: ['admin', 'clinic_admin', 'manager'] }
    );

    const { data, error } = await supabase
      .from('blocks')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('clinic_id', clinic_id)  // Double-check clinic ownership
      .select()
      .single();

    if (error) {
      return createErrorResponse(error.message, 500);
    }

    return createSuccessResponse({ block: data });
  } catch (error) {
    return createErrorResponse('Unauthorized', 401);
  }
}

/**
 * DELETE /api/blocks?id=xxx&clinic_id=xxx
 * Delete a block
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const clinicId = searchParams.get('clinic_id');

  if (!id || !clinicId) {
    return createErrorResponse('id and clinic_id are required', 400);
  }

  try {
    const { supabase } = await ensureClinicAccess(
      request,
      '/api/blocks',
      clinicId,
      { allowedRoles: ['admin', 'clinic_admin'] }
    );

    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('id', id)
      .eq('clinic_id', clinicId);  // Double-check clinic ownership

    if (error) {
      return createErrorResponse(error.message, 500);
    }

    return createSuccessResponse({ message: 'Block deleted' });
  } catch (error) {
    return createErrorResponse('Unauthorized', 401);
  }
}
```

### 2. Replace BlockService with API client (Priority: P0)

Update `src/lib/services/block-service.ts`:

```typescript
/**
 * Block API Client
 * Replaces direct Supabase access with server-side API calls
 */

import type { Block, CreateBlockData } from '@/types/reservation';

const API_BASE = '/api/blocks';

export class BlockService {
  private clinicId: string;

  constructor(clinicId: string) {
    if (!clinicId) {
      throw new Error('clinicId is required for BlockService');
    }
    this.clinicId = clinicId;
  }

  private async fetchApi<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  async createBlock(data: CreateBlockData): Promise<Block> {
    const result = await this.fetchApi<{ block: Block }>('', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        clinic_id: this.clinicId,
      }),
    });
    return result.block;
  }

  async getBlockById(id: string): Promise<Block> {
    const result = await this.fetchApi<{ blocks: Block[] }>(
      `?clinic_id=${this.clinicId}&id=${id}`
    );
    if (!result.blocks.length) {
      throw new Error('Block not found');
    }
    return result.blocks[0];
  }

  async getBlocksByDateRange(startDate: Date, endDate: Date): Promise<Block[]> {
    const result = await this.fetchApi<{ blocks: Block[] }>(
      `?clinic_id=${this.clinicId}&start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`
    );
    return result.blocks;
  }

  async updateBlock(id: string, updates: Partial<Block>): Promise<Block> {
    const result = await this.fetchApi<{ block: Block }>('', {
      method: 'PUT',
      body: JSON.stringify({
        id,
        clinic_id: this.clinicId,
        ...updates,
      }),
    });
    return result.block;
  }

  async deleteBlock(id: string): Promise<boolean> {
    await this.fetchApi(`?id=${id}&clinic_id=${this.clinicId}`, {
      method: 'DELETE',
    });
    return true;
  }
}
```

### 3. Update UI components to pass clinic_id (Priority: P0)

Update `src/app/blocks/page.tsx`:

```typescript
'use client';

import { useUserProfile } from '@/hooks/useUserProfile';
import { BlockService } from '@/lib/services/block-service';
import { useMemo } from 'react';

export default function BlocksPage() {
  const { profile } = useUserProfile();
  const clinicId = profile?.clinicId;

  // Create BlockService instance with clinic_id
  const blockService = useMemo(() => {
    if (!clinicId) return null;
    return new BlockService(clinicId);
  }, [clinicId]);

  if (!clinicId) {
    return <div>Loading...</div>;
  }

  // Use blockService for all operations
  // ...
}
```

### 4. Move reservation block-conflict checks to server (Priority: P1)

The `validateTimeSlot()` function in reservation-service.ts directly queries blocks. Move this to a server endpoint:

```typescript
// src/app/api/reservations/validate/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { clinic_id, resource_id, start_time, end_time, exclude_reservation_id } = body;

  const { supabase } = await ensureClinicAccess(
    request,
    '/api/reservations/validate',
    clinic_id
  );

  // Check for block conflicts
  const { data: conflicts } = await supabase
    .from('blocks')
    .select('*')
    .eq('clinic_id', clinic_id)
    .eq('resource_id', resource_id)
    .or(`start_time.lt.${end_time},end_time.gt.${start_time}`)
    .limit(1);

  if (conflicts?.length) {
    return createSuccessResponse({
      valid: false,
      reason: 'Time slot is blocked',
      conflict: conflicts[0],
    });
  }

  // Check for reservation conflicts
  let query = supabase
    .from('reservations')
    .select('*')
    .eq('clinic_id', clinic_id)
    .eq('resource_id', resource_id)
    .or(`start_time.lt.${end_time},end_time.gt.${start_time}`);

  if (exclude_reservation_id) {
    query = query.neq('id', exclude_reservation_id);
  }

  const { data: reservationConflicts } = await query.limit(1);

  if (reservationConflicts?.length) {
    return createSuccessResponse({
      valid: false,
      reason: 'Time slot is already reserved',
      conflict: reservationConflicts[0],
    });
  }

  return createSuccessResponse({ valid: true });
}
```

### 5. Require clinic_id on every request

Update `ensureClinicAccess()` to make clinicId required for tenant operations:

```typescript
// src/lib/supabase/guards.ts
export async function ensureClinicAccess(
  request: Request,
  path: string,
  clinicId: string | null,
  options: ClinicAccessOptions = {}
): Promise<ClinicAccessContext> {
  // ... existing code ...

  // For tenant table operations, clinic_id is always required
  if (clinicId === null && options.requireClinicMatch !== false) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'clinic_id is required for this operation',
      400
    );
  }

  // ... rest of function
}
```

## Migration Strategy

### Phase 1: Add API routes (parallel safe)
1. Create `/api/blocks` route
2. Create `/api/reservations/validate` route
3. Keep existing BlockService as fallback

### Phase 2: Update clients
1. Update BlockService to use API
2. Update UI components to pass clinic_id
3. Update reservation validation to use API

### Phase 3: Remove direct access
1. Remove `createClient()` from BlockService
2. Remove direct `from('blocks')` calls
3. Verify with grep command

## Non-goals
- UI feature changes.
- RLS policy updates (handled in spec-rls-tenant-boundary-v0.1.md).

## Acceptance Criteria (DoD)
- DOD-09: `rg -n "from\('blocks'\)|from\('reservations'\)" src` shows no client-side Supabase access.
- All tenant table operations go through `/api/*` routes with `ensureClinicAccess()`.
- All API routes require and validate `clinic_id`.

## Rollback
- If API migration breaks UI flows, revert to the previous client implementation and add explicit clinic_id filters as a temporary guard.
- Rollback steps:
  1. Revert BlockService to use createClient()
  2. Add explicit `.eq('clinic_id', clinicId)` to all queries
  3. Document as technical debt

## Verification

```bash
# Check for direct Supabase access in client code
rg -n "from\('blocks'\)|from\('reservations'\)" src --glob '!**/api/**' --glob '!**/*.test.*'

# Expected: 0 matches (only API routes should access these tables)

# Run E2E tests
npm run test:e2e:pw -- src/__tests__/e2e-playwright/reservations.spec.ts
```

## Files to Modify
- src/app/api/blocks/route.ts (new)
- src/app/api/reservations/validate/route.ts (new)
- src/lib/services/block-service.ts (rewrite)
- src/lib/services/reservation-service.ts (refactor)
- src/app/blocks/page.tsx
- src/app/reservations/page.tsx
- src/lib/supabase/guards.ts

## Security Checklist

| Check | Status |
|-------|--------|
| All tenant table access goes through API routes | |
| All API routes use ensureClinicAccess() | |
| clinic_id is required in all requests | |
| clinic_id is validated against user's permissions | |
| Double-check clinic ownership in UPDATE/DELETE | |
| Audit logging for sensitive operations | |
| No createClient() in non-API code | |
