import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// -----------------------------------------------------------------------------
// Helper: assert the calling user has role 'admin' in user_roles.
// -----------------------------------------------------------------------------
async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

// -----------------------------------------------------------------------------
// Create a doctor account end-to-end (auth user + profile + doctor_details + role)
// -----------------------------------------------------------------------------
export const adminCreateDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
      specialty: string;
      city?: string;
      bio?: string;
      consultationFee?: number;
      currency?: string;
      yearsExperience?: number;
      telemedicineEnabled?: boolean;
      isVerified?: boolean;
    }) => {
      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        throw new Error("Invalid email");
      }
      if (!data.password || data.password.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      if (!data.fullName?.trim()) throw new Error("Full name required");
      if (!data.specialty?.trim()) throw new Error("Specialty required");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // 1. create auth user (skip email confirmation for admin-created accounts)
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          full_name: data.fullName,
          role: "doctor",
        },
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Could not create auth user");
    }
    const userId = created.user.id;

    try {
      // 2. profile (the handle_new_user trigger may have already created it)
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      let profileId = existingProfile?.id as string | undefined;
      if (!profileId) {
        const { data: ins, error: profErr } = await supabaseAdmin
          .from("profiles")
          .insert({
            user_id: userId,
            full_name: data.fullName,
            city: data.city ?? null,
          })
          .select("id")
          .single();
        if (profErr) throw new Error(`profile: ${profErr.message}`);
        profileId = ins.id as string;
      } else {
        await supabaseAdmin
          .from("profiles")
          .update({
            full_name: data.fullName,
            city: data.city ?? null,
          })
          .eq("id", profileId);
      }
      if (data.phone) {
        await supabaseAdmin
          .from("user_contacts")
          .upsert({ user_id: userId, phone: data.phone }, { onConflict: "user_id" });
      }

      // 3. user_roles -> doctor
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "doctor" },
          { onConflict: "user_id,role" },
        );

      // 4. doctor_details
      const { data: dd, error: ddErr } = await supabaseAdmin
        .from("doctor_details")
        .insert({
          profile_id: profileId,
          specialty: data.specialty,
          bio: data.bio ?? null,
          consultation_fee: data.consultationFee ?? 0,
          currency: data.currency ?? "EGP",
          years_experience: data.yearsExperience ?? 0,
          telemedicine_enabled: Boolean(data.telemedicineEnabled),
          is_verified: data.isVerified ?? true,
          verification_status: data.isVerified === false ? "pending" : "approved",
        })
        .select("id")
        .single();
      if (ddErr) throw new Error(`doctor_details: ${ddErr.message}`);

      return { userId, profileId, doctorId: dd.id as string };
    } catch (e) {
      // Roll back the auth user if anything below failed
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw e;
    }
  });

// -----------------------------------------------------------------------------
// Delete a doctor and everything they own
// -----------------------------------------------------------------------------
export const adminDeleteDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { doctorId: string }) => {
    if (!data.doctorId) throw new Error("doctorId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("id, profile_id, profiles(user_id)")
      .eq("id", data.doctorId)
      .maybeSingle();
    if (!dd) throw new Error("Doctor not found");

    // Cascade: clinics -> schedules / time_off / appointments handled by FKs
    await supabaseAdmin.from("appointments").delete().eq("doctor_id", data.doctorId);
    await supabaseAdmin.from("clinics").delete().eq("doctor_id", data.doctorId);
    await supabaseAdmin.from("doctor_details").delete().eq("id", data.doctorId);

    // Auth user (if profile has one)
    const userId = (dd as unknown as { profiles?: { user_id?: string } })
      .profiles?.user_id;
    if (userId) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    }

    return { ok: true };
  });

// -----------------------------------------------------------------------------
// List today's queue for any doctor (admin debug view)
// -----------------------------------------------------------------------------
export const adminGetDoctorQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { doctorId: string; date?: string }) => {
      if (!data.doctorId) throw new Error("doctorId required");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const date = data.date ?? new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await supabaseAdmin
      .from("appointments")
      .select(
        `id, queue_number, status, scheduled_at, estimated_start_at,
         appointment_type, fee, notes,
         clinic:clinics(name, address),
         patient:profiles!appointments_patient_id_fkey(full_name, phone)`,
      )
      .eq("doctor_id", data.doctorId)
      .eq("appointment_date", date)
      .order("queue_number", { ascending: true });
    if (error) throw new Error(error.message);
    return { date, rows: rows ?? [] };
  });
