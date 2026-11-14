/**
 * lib/facultySelection.schemas.ts — Zod input schemas for the Faculty Selection module
 * (same style as lib/validation.ts). Roll number, section, group and filled counts are
 * never accepted from students; they come from the login and the database.
 */
import { z } from 'zod';

export const SEMESTER_LABEL_REGEX = /^[1-4]-[12]$/;
const uuid = z.string().uuid('Invalid id');
const isoDate = z.string().refine(v => !Number.isNaN(Date.parse(v)), 'Invalid date-time');
const section = z.string().trim().min(1, 'Section is required').max(10).transform(v => v.toUpperCase());

export const roundCreateSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  semester_label: z.string().trim().regex(SEMESTER_LABEL_REGEX, 'Semester must look like 4-1 or 3-2'),
  department: z.string().trim().max(50).optional(),
  starts_at: isoDate,
  ends_at: isoDate,
}).refine(v => Date.parse(v.ends_at) > Date.parse(v.starts_at), { message: 'Close time must be after open time', path: ['ends_at'] });

export const roundUpdateSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  starts_at: isoDate.optional(),
  ends_at: isoDate.optional(),
  sections: z.array(section).max(40).optional(),
});

export const roundStatusSchema = z.object({ status: z.enum(['draft', 'open', 'closed']) });

export const eligibleAddSchema = z.object({
  rolls: z.array(z.string().trim().max(20)).min(1, 'Add at least one roll number').max(5000, 'At most 5000 roll numbers at a time'),
});

export const groupSchema = z.object({ name: z.string().trim().min(1, 'Group name is required').max(30) });

export const subjectSchema = z.object({
  subject_name: z.string().trim().min(2, 'Subject name is required').max(200),
  subject_type: z.enum(['Theory', 'Lab']),
  sort_order: z.number().int().min(0).max(999).optional(),
});
export const subjectUpdateSchema = subjectSchema.partial();

export const offeringCreateSchema = z.object({
  group_id: uuid,
  section,
  faculty_email: z.string().trim().email('Pick a faculty member').max(100),
  capacity: z.number().int().min(1, 'Seats must be at least 1').max(1000),
});
export const offeringUpdateSchema = z.object({
  capacity: z.number().int().min(0).max(1000).optional(),
  faculty_email: z.string().trim().email().max(100).optional(),
});

export const selectSchema = z.object({
  choices: z.array(z.object({ subject_id: uuid, offering_id: uuid })).min(1, 'Choose at least one faculty').max(30),
});

export const releaseSchema = z.object({ reason: z.string().trim().max(300).optional() });
export const assignSchema = z.object({
  roll_number: z.string().trim().min(5).max(10).transform(v => v.toUpperCase()),
  subject_id: uuid,
  offering_id: uuid,
});
export const reassignSchema = z.object({ offering_id: uuid, reason: z.string().trim().max(300).optional() });

/** First Zod issue as a readable message */
export function zodMessage(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message) : 'Invalid input';
}
