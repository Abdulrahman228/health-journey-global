/**
 * Column lists that anonymous / regular users may read from the public
 * directory tables. The database revokes SELECT on the sensitive columns
 * (licence documents, verification notes, national id, push tokens, medical
 * card, phone) for the `anon` role, so a `select("*")` from a signed-out
 * visitor would be rejected with "permission denied" — always use these lists
 * on public pages.
 */
export const PUBLIC_DOCTOR_COLUMNS =
  "id, profile_id, specialty, clinic_name, clinic_address, bio, consultation_fee, rating, years_experience, is_verified, verification_status, created_at, currency, languages, education, certifications, about_ar, about_en, is_pro, pro_plus_active, telemedicine_enabled, solo_mode_enabled, solo_brand_color, solo_logo_url, solo_clinic_name, reviews_count, subscription_plan, followup_period_days, university, qualifications, online_consultation_fee, source, is_claimed";

export const PUBLIC_PROFILE_COLUMNS =
  "id, user_id, full_name, avatar_url, country, city, created_at, slug, public_bio, public_banner_url, profile_visibility, profile_views_count, social_links, status";
