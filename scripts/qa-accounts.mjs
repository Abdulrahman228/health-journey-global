// QA accounts for visual/functional checks on production — create and delete.
//
//   node scripts/qa-accounts.mjs create   → prints the two e-mails + one password (shown once)
//   node scripts/qa-accounts.mjs delete   → removes the accounts and everything they own
//
// Reads SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY from
// .dev.vars / the environment. Never commit .dev.vars.
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function loadDevVars() {
  if (!existsSync(".dev.vars")) return;
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDevVars();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (put them in .dev.vars).");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const ACCOUNTS = [
  { email: "qa.doctor2@mytabibi.com", role: "doctor", fullName: "QA Doctor Tebana" },
  { email: "qa.patient2@mytabibi.com", role: "patient", fullName: "QA Patient Tebana" },
];

async function findUser(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
}

async function create() {
  const password = "Qa!" + randomBytes(9).toString("base64url");
  for (const a of ACCOUNTS) {
    const existing = await findUser(a.email);
    if (existing) {
      console.log(`exists: ${a.email} (${existing.id}) — resetting password`);
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
      if (error) throw error;
      continue;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: a.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: a.fullName, role: a.role, qa: true },
    });
    if (error) throw error;
    const user = data.user;
    // Mirror what the sign-up flow writes: role + profile + details row.
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: user.id, role: a.role });
    if (roleErr && !/duplicate/i.test(roleErr.message)) throw roleErr;
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .insert({ user_id: user.id, full_name: a.fullName, role: a.role })
      .select("id")
      .single();
    if (profErr) throw profErr;
    if (a.role === "doctor") {
      const { error } = await admin
        .from("doctor_details")
        .insert({ profile_id: profile.id, user_id: user.id, specialty: "طب عام", consultation_fee: 300, is_verified: false });
      if (error) throw error;
    } else {
      const { error } = await admin.from("patient_details").insert({ profile_id: profile.id, user_id: user.id });
      if (error) throw error;
    }
    console.log(`created: ${a.email} (${user.id})`);
  }
  console.log(`\npassword for both (shown once): ${password}`);
}

async function del() {
  for (const a of ACCOUNTS) {
    const user = await findUser(a.email);
    if (!user) {
      console.log(`not found: ${a.email}`);
      continue;
    }
    const { data: profiles } = await admin.from("profiles").select("id").eq("user_id", user.id);
    const profileIds = (profiles ?? []).map((p) => p.id);
    if (profileIds.length) {
      const { data: docs } = await admin.from("doctor_details").select("id").in("profile_id", profileIds);
      const doctorIds = (docs ?? []).map((d) => d.id);
      if (doctorIds.length) {
        await admin.from("doctor_transactions").delete().in("doctor_details_id", doctorIds);
        await admin.from("appointments").delete().in("doctor_id", doctorIds);
        await admin.from("clinics").delete().in("doctor_id", doctorIds);
      }
      await admin.from("appointments").delete().in("patient_id", profileIds);
      await admin.from("profiles").delete().in("id", profileIds); // details/medical profile cascade
    }
    await admin.from("user_roles").delete().eq("user_id", user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id); // subscriptions/addresses cascade
    if (error) throw error;
    console.log(`deleted: ${a.email}`);
  }
}

const cmd = process.argv[2];
if (cmd === "create") await create();
else if (cmd === "delete") await del();
else {
  console.error("usage: node scripts/qa-accounts.mjs create|delete");
  process.exit(1);
}
