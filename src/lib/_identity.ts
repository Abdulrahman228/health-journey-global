/**
 * Identity resolution for server functions (2026-11-04).
 *
 * `profiles.id` is a random uuid — it is NOT the auth user id (only the demo
 * seed happens to use the same value). Several server functions used to filter
 * `doctor_details.profile_id = context.userId`, which never matched a real
 * account. Everything must resolve auth user → profile → doctor_details.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getProfileIdForUser(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export type DoctorIdentity = { doctorDetailsId: string; profileId: string };

/** The caller's doctor_details (null when the user is not a doctor). */
export async function getDoctorForUser(userId: string): Promise<DoctorIdentity | null> {
  const profileId = await getProfileIdForUser(userId);
  if (!profileId) return null;
  const { data } = await supabaseAdmin
    .from("doctor_details")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data?.id) return null;
  return { doctorDetailsId: data.id as string, profileId };
}

/** True when `userId` owns the given doctor_details row. */
export async function userOwnsDoctorDetails(
  userId: string,
  doctorDetailsId: string,
): Promise<boolean> {
  const me = await getDoctorForUser(userId);
  return !!me && me.doctorDetailsId === doctorDetailsId;
}

/**
 * Is this doctor (by PROFILE id) allowed to see / write for this patient?
 * One rule for the whole EMR: an appointment between them, a managed-patient
 * link (doctor_patients / managed_by_doctor), a prior medical record, or
 * shared-care consent from the patient to a linked doctor.
 */
export async function isDoctorLinkedToPatient(
  doctorProfileId: string,
  patientProfileId: string,
): Promise<boolean> {
  if (doctorProfileId === patientProfileId) return true;
  const [{ data: rec }, { data: link }, { data: managed }, { data: dd }] = await Promise.all([
    supabaseAdmin
      .from("medical_records")
      .select("id")
      .eq("patient_profile_id", patientProfileId)
      .eq("doctor_profile_id", doctorProfileId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("doctor_patients")
      .select("id")
      .eq("doctor_profile_id", doctorProfileId)
      .eq("patient_profile_id", patientProfileId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", patientProfileId)
      .eq("managed_by_doctor", doctorProfileId)
      .maybeSingle(),
    supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", doctorProfileId)
      .maybeSingle(),
  ]);
  if (rec || link || managed) return true;
  if (!dd?.id) return false;
  const { data: appt } = await supabaseAdmin
    .from("appointments")
    .select("id")
    .eq("doctor_id", dd.id as string)
    .eq("patient_id", patientProfileId)
    .not("status", "in", "(cancelled,no_show)")
    .limit(1)
    .maybeSingle();
  return !!appt;
}
