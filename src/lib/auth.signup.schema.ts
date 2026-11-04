/**
 * E-mail sign-up input — shared by the `signUpUser` server function (web) and
 * the public `/api/public/auth/signup` endpoint used by the Android/iOS apps.
 * No server-only imports here: this file is also bundled for the browser.
 */
import { z } from "zod";

// Strong-password rule: min 10 chars, at least one letter and one digit
// (kept ASCII-friendly to avoid breaking Arabic/Latin keyboards).
export const strongPassword = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a digit");

export const emailSignUpSchema = z.object({
  email: z.string().trim().email(),
  password: strongPassword,
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["doctor", "patient"]),
  phone: z.string().optional(),
  city: z.string().optional(),
});

export type EmailSignUpInput = z.infer<typeof emailSignUpSchema>;
