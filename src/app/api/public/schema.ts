/**
 * Public API Schemas
 *
 * Non-authenticated customer API validation schemas
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md - Customer Access Model
 */

import { z } from 'zod';

// ================================================================
// Common Validation
// ================================================================

export const clinicIdSchema = z.string().uuid('clinic_id must be a valid UUID');

// ================================================================
// GET /api/public/menus - Menu Listing
// ================================================================

export const menusQuerySchema = z.object({
  clinic_id: clinicIdSchema,
  category: z.string().optional(),
});

export type MenusQueryDTO = z.infer<typeof menusQuerySchema>;

// ================================================================
// GET /api/public/resources - Public Resource Listing
// ================================================================

export const resourcesQuerySchema = z.object({
  clinic_id: clinicIdSchema,
  type: z.enum(['staff', 'room', 'bed', 'device']).optional(),
});

export type ResourcesQueryDTO = z.infer<typeof resourcesQuerySchema>;

// ================================================================
// GET /api/public/availability - Public Availability
// ================================================================

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const availabilityQuerySchema = z.object({
  clinic_id: clinicIdSchema,
  menu_id: z.string().uuid('menu_id must be a valid UUID'),
  resource_id: z.union([
    z.literal('any'),
    z.string().uuid('resource_id must be a valid UUID or "any"'),
  ]),
  date_from: dateOnlySchema,
  date_to: dateOnlySchema,
});

export type AvailabilityQueryDTO = z.infer<typeof availabilityQuerySchema>;

// ================================================================
// POST /api/public/reservations - Reservation Creation
// ================================================================

export const reservationCreateSchema = z.object({
  clinic_id: clinicIdSchema,
  customer_name: z
    .string()
    .trim()
    .min(1, 'customer_name is required')
    .max(255, 'customer_name must be 255 characters or less'),
  customer_phone: z
    .string()
    .trim()
    .min(1, 'customer_phone is required')
    .max(20, 'customer_phone must be 20 characters or less'),
  customer_email: z.string().email('Invalid email address').optional(),
  menu_id: z.string().uuid('menu_id must be a valid UUID'),
  resource_id: z.union([
    z.literal('any'),
    z.string().uuid('resource_id must be a valid UUID or "any"'),
  ]),
  start_time: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/,
      'start_time must be ISO 8601 format with timezone offset'
    ),
  notes: z
    .string()
    .max(1000, 'notes must be 1000 characters or less')
    .optional(),
  channel: z.enum(['web', 'line']).default('web'),
});

export type ReservationCreateDTO = z.infer<typeof reservationCreateSchema>;
