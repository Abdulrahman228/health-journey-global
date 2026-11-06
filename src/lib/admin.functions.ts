import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
// Authorization gates live in the Admin Kit (single source of truth).
import { assertAdmin } from "./admin/_kit";

// Re-export the Admin Kit surface so existing `admin.functions` import sites can
// reach the new actions/schemas too (adminBanUser, AdminBanUserSchema, ...).
export * from "./admin";

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

      let profileId: string | undefined = existingProfile?.id;
      if (!profileId) {
        const { data: ins, error: profErr } = await supabaseAdmin
          .from("profiles")
          .insert({
            user_id: userId,
            full_name: data.fullName,
            city: data.city?.trim() || null,
          })
          .select("id")
          .single();
        if (profErr) throw new Error(`profile: ${profErr.message}`);
        profileId = ins.id;
      } else {
        const { error: profUpdErr } = await supabaseAdmin
          .from("profiles")
          .update({
            full_name: data.fullName,
            city: data.city?.trim() || null,
          })
          .eq("id", profileId);
        if (profUpdErr) throw new Error(`profile: ${profUpdErr.message}`);
      }
      if (data.phone?.trim()) {
        const { error: contactErr } = await supabaseAdmin
          .from("user_contacts")
          .upsert({ user_id: userId, phone: data.phone.trim() }, { onConflict: "user_id" });
        if (contactErr) throw new Error(`user_contacts: ${contactErr.message}`);
      }

      // 3. user_roles -> doctor (without it the account is not a doctor at all)
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "doctor" },
          { onConflict: "user_id,role" },
        );
      if (roleErr) throw new Error(`user_roles: ${roleErr.message}`);

      // 4. doctor_details — user_id is denormalized and used by RLS
      // (appointments_doctor_read, doctor_details_select_own, ...), so set it.
      const { data: dd, error: ddErr } = await supabaseAdmin
        .from("doctor_details")
        .insert({
          profile_id: profileId,
          user_id: userId,
          specialty: data.specialty,
          bio: data.bio?.trim() || null,
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

      return { userId, profileId, doctorId: dd.id };
    } catch (e) {
      // Roll back everything keyed on the new auth user if any step failed.
      // (profiles/user_roles/user_contacts have no FK to auth.users, so the
      // auth delete alone would leave them orphaned; doctor_details cascades.)
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_contacts").delete().eq("user_id", userId);
      await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
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

    const { data: dd, error: ddErr } = await supabaseAdmin
      .from("doctor_details")
      .select("id, profile_id, user_id, profiles(user_id)")
      .eq("id", data.doctorId)
      .maybeSingle();
    if (ddErr) throw new Error(ddErr.message);
    if (!dd) throw new Error("Doctor not found");

    // clinics.doctor_id has no FK to doctor_details, so delete them explicitly
    // (clinic_schedules / clinic_time_off cascade from clinics). appointments
    // and the other doctor-owned tables cascade from doctor_details.
    const { error: apptErr } = await supabaseAdmin
      .from("appointments")
      .delete()
      .eq("doctor_id", data.doctorId);
    if (apptErr) throw new Error(`appointments: ${apptErr.message}`);
    const { error: clinicsErr } = await supabaseAdmin
      .from("clinics")
      .delete()
      .eq("doctor_id", data.doctorId);
    if (clinicsErr) throw new Error(`clinics: ${clinicsErr.message}`);
    const { error: delErr } = await supabaseAdmin
      .from("doctor_details")
      .delete()
      .eq("id", data.doctorId);
    if (delErr) throw new Error(`doctor_details: ${delErr.message}`);

    // Auth user (if the profile has one). Never delete a privileged account
    // (a user may be doctor + admin): only their doctor listing goes.
    const userId = dd.profiles?.user_id ?? dd.user_id;
    const warnings: string[] = [];
    if (userId) {
      const { data: roles, error: rolesErr } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (rolesErr) throw new Error(rolesErr.message);
      const privileged = (roles ?? []).some(
        (r) => r.role === "admin" || r.role === "super_admin",
      );
      if (privileged) {
        const { error } = await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "doctor");
        if (error) warnings.push(`user_roles: ${error.message}`);
      } else {
        const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (authErr) warnings.push(`auth: ${authErr.message}`);
        // medical_records.doctor_profile_id is ON DELETE RESTRICT: a doctor with
        // charted visits keeps the (now login-less) profile for history.
        const { error: profErr } = await supabaseAdmin
          .from("profiles")
          .delete()
          .eq("user_id", userId);
        if (profErr) warnings.push(`profile: ${profErr.message}`);
        const { error: rolesDelErr } = await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", userId);
        if (rolesDelErr) warnings.push(`user_roles: ${rolesDelErr.message}`);
      }
    }

    return { ok: true, warnings };
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
      // Range over `scheduled_at` (always set) instead of the nullable,
      // denormalized `appointment_date`, so appointments created without an
      // appointment_date (e.g. via other clients) are not silently hidden.
      .gte("scheduled_at", `${date}T00:00:00Z`)
      .lt("scheduled_at", new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString())
      .order("queue_number", { ascending: true });
    if (error) throw new Error(error.message);
    return { date, rows: rows ?? [] };
  });
