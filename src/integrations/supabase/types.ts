export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_consultations: {
        Row: {
          created_at: string
          doctor_profile_id: string | null
          evidence: string | null
          feedback: number | null
          feedback_note: string | null
          id: string
          latency_ms: number | null
          model: string | null
          query_en: string | null
          reference_ids: number[]
          response: Json
          specialty: string | null
          symptoms: string[]
        }
        Insert: {
          created_at?: string
          doctor_profile_id?: string | null
          evidence?: string | null
          feedback?: number | null
          feedback_note?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          query_en?: string | null
          reference_ids?: number[]
          response?: Json
          specialty?: string | null
          symptoms?: string[]
        }
        Update: {
          created_at?: string
          doctor_profile_id?: string | null
          evidence?: string | null
          feedback?: number | null
          feedback_note?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          query_en?: string | null
          reference_ids?: number[]
          response?: Json
          specialty?: string | null
          symptoms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_consultations_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string | null
          appointment_type: string
          called_at: string | null
          clinic_id: string | null
          commission_cents: number | null
          consultation_fee_cents: number | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string
          currency: string
          doctor_id: string
          duration_minutes: number
          ended_at: string | null
          estimated_start_at: string | null
          fee: number
          id: string
          invoice_id: string | null
          is_emergency: boolean | null
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_receipt_at: string | null
          payment_receipt_url: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          reminder_email_sent_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          visit_type: string | null
        }
        Insert: {
          appointment_date?: string | null
          appointment_type?: string
          called_at?: string | null
          clinic_id?: string | null
          commission_cents?: number | null
          consultation_fee_cents?: number | null
          coupon_code?: string | null
          coupon_discount?: number | null
          created_at?: string
          currency?: string
          doctor_id: string
          duration_minutes?: number
          ended_at?: string | null
          estimated_start_at?: string | null
          fee?: number
          id?: string
          invoice_id?: string | null
          is_emergency?: boolean | null
          notes?: string | null
          paid_at?: string | null
          patient_consent_accepted?: boolean
          patient_id: string
          payment_environment?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_receipt_at?: string | null
          payment_receipt_url?: string | null
          payment_status?: string
          queue_number?: number | null
          refunded_amount?: number
          refunded_at?: string | null
          reminder_email_sent_at?: string | null
          scheduled_at: string
          started_at?: string | null
          status?: string
          updated_at?: string
          visit_type?: string | null
        }
        Update: {
          appointment_date?: string | null
          appointment_type?: string
          called_at?: string | null
          clinic_id?: string | null
          commission_cents?: number | null
          consultation_fee_cents?: number | null
          coupon_code?: string | null
          coupon_discount?: number | null
          created_at?: string
          currency?: string
          doctor_id?: string
          duration_minutes?: number
          ended_at?: string | null
          estimated_start_at?: string | null
          fee?: number
          id?: string
          invoice_id?: string | null
          is_emergency?: boolean | null
          notes?: string | null
          paid_at?: string | null
          patient_consent_accepted?: boolean
          patient_id?: string
          payment_environment?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_receipt_at?: string | null
          payment_receipt_url?: string | null
          payment_status?: string
          queue_number?: number | null
          refunded_amount?: number
          refunded_at?: string | null
          reminder_email_sent_at?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_doctor_id: string | null
          author_name: string | null
          body_md: string
          cover_image: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_published: boolean
          language: string
          published_at: string | null
          reading_minutes: number | null
          slug: string
          specialty_slug: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_doctor_id?: string | null
          author_name?: string | null
          body_md: string
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_published?: boolean
          language?: string
          published_at?: string | null
          reading_minutes?: number | null
          slug: string
          specialty_slug?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_doctor_id?: string | null
          author_name?: string | null
          body_md?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_published?: boolean
          language?: string
          published_at?: string | null
          reading_minutes?: number | null
          slug?: string
          specialty_slug?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_doctor_id_fkey"
            columns: ["author_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clinic_schedules: {
        Row: {
          avg_consultation_minutes: number
          clinic_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          max_patients_per_day: number | null
          slot_duration_minutes: number
          start_time: string
        }
        Insert: {
          avg_consultation_minutes?: number
          clinic_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          max_patients_per_day?: number | null
          slot_duration_minutes?: number
          start_time: string
        }
        Update: {
          avg_consultation_minutes?: number
          clinic_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          max_patients_per_day?: number | null
          slot_duration_minutes?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_schedules_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_time_off: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          off_date: string
          reason: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          off_date: string
          reason?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          off_date?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_time_off_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          accepts_clinic_payment: boolean | null
          accepts_online_payment: boolean | null
          address: string | null
          building: string | null
          building_id: string | null
          city: string | null
          city_id: string | null
          consultation_fee: number | null
          country: string | null
          country_id: string | null
          created_at: string
          currency: string | null
          district_id: string | null
          doctor_id: string
          floor_unit: string | null
          google_maps_uri: string | null
          google_place_id: string | null
          governorate_id: string | null
          id: string
          is_primary: boolean | null
          landmark: string | null
          lat: number | null
          lng: number | null
          name: string
          online_fee: number | null
          phone: string | null
          place_verified: boolean
          place_verified_at: string | null
          services: string | null
          street: string | null
          updated_at: string
        }
        Insert: {
          accepts_clinic_payment?: boolean | null
          accepts_online_payment?: boolean | null
          address?: string | null
          building?: string | null
          building_id?: string | null
          city?: string | null
          city_id?: string | null
          consultation_fee?: number | null
          country?: string | null
          country_id?: string | null
          created_at?: string
          currency?: string | null
          district_id?: string | null
          doctor_id: string
          floor_unit?: string | null
          google_maps_uri?: string | null
          google_place_id?: string | null
          governorate_id?: string | null
          id?: string
          is_primary?: boolean | null
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          online_fee?: number | null
          phone?: string | null
          place_verified?: boolean
          place_verified_at?: string | null
          services?: string | null
          street?: string | null
          updated_at?: string
        }
        Update: {
          accepts_clinic_payment?: boolean | null
          accepts_online_payment?: boolean | null
          address?: string | null
          building?: string | null
          building_id?: string | null
          city?: string | null
          city_id?: string | null
          consultation_fee?: number | null
          country?: string | null
          country_id?: string | null
          created_at?: string
          currency?: string | null
          district_id?: string | null
          doctor_id?: string
          floor_unit?: string | null
          google_maps_uri?: string | null
          google_place_id?: string | null
          governorate_id?: string | null
          id?: string
          is_primary?: boolean | null
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          online_fee?: number | null
          phone?: string | null
          place_verified?: boolean
          place_verified_at?: string | null
          services?: string | null
          street?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinics_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinics_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinics_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinics_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinics_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string | null
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          likes_count: number | null
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          likes_count?: number | null
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          likes_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_requests: {
        Row: {
          appointment_id: string | null
          consultation_type: string
          created_at: string
          currency: string
          doctor_details_id: string
          doctor_note: string | null
          doctor_reject_note: string | null
          expires_at: string | null
          fee_cents: number | null
          id: string
          paid_at: string | null
          patient_id: string
          patient_reject_note: string | null
          payment_intent_id: string | null
          preferred_dates: Json | null
          proposed_at: string | null
          proposed_duration_minutes: number | null
          proposed_slot: string | null
          reason: string
          responded_at: string | null
          status: Database["public"]["Enums"]["consultation_request_status"]
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          consultation_type?: string
          created_at?: string
          currency?: string
          doctor_details_id: string
          doctor_note?: string | null
          doctor_reject_note?: string | null
          expires_at?: string | null
          fee_cents?: number | null
          id?: string
          paid_at?: string | null
          patient_id: string
          patient_reject_note?: string | null
          payment_intent_id?: string | null
          preferred_dates?: Json | null
          proposed_at?: string | null
          proposed_duration_minutes?: number | null
          proposed_slot?: string | null
          reason: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["consultation_request_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          consultation_type?: string
          created_at?: string
          currency?: string
          doctor_details_id?: string
          doctor_note?: string | null
          doctor_reject_note?: string | null
          expires_at?: string | null
          fee_cents?: number | null
          id?: string
          paid_at?: string | null
          patient_id?: string
          patient_reject_note?: string | null
          payment_intent_id?: string | null
          preferred_dates?: Json | null
          proposed_at?: string | null
          proposed_duration_minutes?: number | null
          proposed_slot?: string | null
          reason?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["consultation_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "consultation_requests_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          appointment_id: string
          coupon_id: string
          currency: string
          discount_amount: number
          final_amount: number
          id: string
          original_amount: number
          redeemed_at: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          coupon_id: string
          currency: string
          discount_amount: number
          final_amount: number
          id?: string
          original_amount: number
          redeemed_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          coupon_id?: string
          currency?: string
          discount_amount?: number
          final_amount?: number
          id?: string
          original_amount?: number
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applies_to: string
          code: string
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          discount_type: string
          discount_value: number
          doctor_id: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_amount: number | null
          times_used: number
          updated_at: string
          usage_limit: number | null
          usage_limit_per_user: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applies_to?: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          doctor_id?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_amount?: number | null
          times_used?: number
          updated_at?: string
          usage_limit?: number | null
          usage_limit_per_user?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applies_to?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          doctor_id?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_amount?: number | null
          times_used?: number
          updated_at?: string
          usage_limit?: number | null
          usage_limit_per_user?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      doctor_billing_settings: {
        Row: {
          account_holder: string | null
          bank_name: string | null
          created_at: string
          doctor_details_id: string
          iban_or_account: string | null
          instapay_handle: string | null
          minimum_payout: number
          payout_method: string
          platform_fee_pct: number
          swift: string | null
          tax_id: string | null
          updated_at: string
          vat_registered: boolean
          vodafone_number: string | null
        }
        Insert: {
          account_holder?: string | null
          bank_name?: string | null
          created_at?: string
          doctor_details_id: string
          iban_or_account?: string | null
          instapay_handle?: string | null
          minimum_payout?: number
          payout_method?: string
          platform_fee_pct?: number
          swift?: string | null
          tax_id?: string | null
          updated_at?: string
          vat_registered?: boolean
          vodafone_number?: string | null
        }
        Update: {
          account_holder?: string | null
          bank_name?: string | null
          created_at?: string
          doctor_details_id?: string
          iban_or_account?: string | null
          instapay_handle?: string | null
          minimum_payout?: number
          payout_method?: string
          platform_fee_pct?: number
          swift?: string | null
          tax_id?: string | null
          updated_at?: string
          vat_registered?: boolean
          vodafone_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_billing_settings_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: true
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_consent: {
        Row: {
          created_at: string
          data_protection_law_accepted: boolean
          data_protection_law_signed_at: string | null
          doctor_id: string
          electronic_billing_accepted: boolean
          electronic_billing_signed_at: string | null
          id: string
          ip_address: string | null
          telemedicine_2023_accepted: boolean
          telemedicine_2023_signed_at: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          data_protection_law_accepted?: boolean
          data_protection_law_signed_at?: string | null
          doctor_id: string
          electronic_billing_accepted?: boolean
          electronic_billing_signed_at?: string | null
          id?: string
          ip_address?: string | null
          telemedicine_2023_accepted?: boolean
          telemedicine_2023_signed_at?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          data_protection_law_accepted?: boolean
          data_protection_law_signed_at?: string | null
          doctor_id?: string
          electronic_billing_accepted?: boolean
          electronic_billing_signed_at?: string | null
          id?: string
          ip_address?: string | null
          telemedicine_2023_accepted?: boolean
          telemedicine_2023_signed_at?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      doctor_credentials: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          license_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          license_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          license_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_credentials_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_details: {
        Row: {
          about_ar: string | null
          about_en: string | null
          bio: string | null
          certifications: string[] | null
          claimed_at: string | null
          clinic_address: string | null
          clinic_name: string | null
          consultation_fee: number | null
          created_at: string
          credentials_completed_at: string | null
          credentials_review_started_at: string | null
          currency: string | null
          education: string | null
          followup_period_days: number | null
          id: string
          is_claimed: boolean
          is_pro: boolean
          is_verified: boolean | null
          languages: string[] | null
          license_document_url: string | null
          national_id_last4: string | null
          online_consultation_fee: number | null
          pro_plus_active: boolean
          profile_id: string | null
          qualifications: string | null
          rating: number | null
          referral_code: string | null
          reviews_count: number
          signature_url: string | null
          solo_brand_color: string | null
          solo_clinic_name: string | null
          solo_logo_url: string | null
          solo_mode_enabled: boolean
          source: string
          specialty: string | null
          stamp_url: string | null
          subscription_plan: string
          syndicate_number: string | null
          telemedicine_enabled: boolean
          university: string | null
          updated_at: string
          user_id: string | null
          verification_level: number
          verification_notes: string | null
          verification_reviewed_at: string | null
          verification_reviewed_by: string | null
          verification_status: string | null
          verification_submitted_at: string | null
          years_experience: number | null
        }
        Insert: {
          about_ar?: string | null
          about_en?: string | null
          bio?: string | null
          certifications?: string[] | null
          claimed_at?: string | null
          clinic_address?: string | null
          clinic_name?: string | null
          consultation_fee?: number | null
          created_at?: string
          credentials_completed_at?: string | null
          credentials_review_started_at?: string | null
          currency?: string | null
          education?: string | null
          followup_period_days?: number | null
          id?: string
          is_claimed?: boolean
          is_pro?: boolean
          is_verified?: boolean | null
          languages?: string[] | null
          license_document_url?: string | null
          national_id_last4?: string | null
          online_consultation_fee?: number | null
          pro_plus_active?: boolean
          profile_id?: string | null
          qualifications?: string | null
          rating?: number | null
          referral_code?: string | null
          reviews_count?: number
          signature_url?: string | null
          solo_brand_color?: string | null
          solo_clinic_name?: string | null
          solo_logo_url?: string | null
          solo_mode_enabled?: boolean
          source?: string
          specialty?: string | null
          stamp_url?: string | null
          subscription_plan?: string
          syndicate_number?: string | null
          telemedicine_enabled?: boolean
          university?: string | null
          updated_at?: string
          user_id?: string | null
          verification_level?: number
          verification_notes?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string | null
          verification_submitted_at?: string | null
          years_experience?: number | null
        }
        Update: {
          about_ar?: string | null
          about_en?: string | null
          bio?: string | null
          certifications?: string[] | null
          claimed_at?: string | null
          clinic_address?: string | null
          clinic_name?: string | null
          consultation_fee?: number | null
          created_at?: string
          credentials_completed_at?: string | null
          credentials_review_started_at?: string | null
          currency?: string | null
          education?: string | null
          followup_period_days?: number | null
          id?: string
          is_claimed?: boolean
          is_pro?: boolean
          is_verified?: boolean | null
          languages?: string[] | null
          license_document_url?: string | null
          national_id_last4?: string | null
          online_consultation_fee?: number | null
          pro_plus_active?: boolean
          profile_id?: string | null
          qualifications?: string | null
          rating?: number | null
          referral_code?: string | null
          reviews_count?: number
          signature_url?: string | null
          solo_brand_color?: string | null
          solo_clinic_name?: string | null
          solo_logo_url?: string | null
          solo_mode_enabled?: boolean
          source?: string
          specialty?: string | null
          stamp_url?: string | null
          subscription_plan?: string
          syndicate_number?: string | null
          telemedicine_enabled?: boolean
          university?: string | null
          updated_at?: string
          user_id?: string | null
          verification_level?: number
          verification_notes?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string | null
          verification_submitted_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_documents: {
        Row: {
          doctor_id: string
          document_type: string
          file_name: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          notes_internal: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          doctor_id: string
          document_type: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes_internal?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          doctor_id?: string
          document_type?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes_internal?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_documents_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          doctor_details_id: string | null
          doctor_id: string
          expense_date: string | null
          id: string
          note: string | null
          receipt_url: string | null
          spent_at: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          doctor_details_id?: string | null
          doctor_id: string
          expense_date?: string | null
          id?: string
          note?: string | null
          receipt_url?: string | null
          spent_at: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          doctor_details_id?: string | null
          doctor_id?: string
          expense_date?: string | null
          id?: string
          note?: string | null
          receipt_url?: string | null
          spent_at?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_expenses_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_expenses_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_finance_pins: {
        Row: {
          doctor_details_id: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          updated_at: string
        }
        Insert: {
          doctor_details_id: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          updated_at?: string
        }
        Update: {
          doctor_details_id?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_finance_pins_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: true
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_followup_settings: {
        Row: {
          doctor_details_id: string
          followup_fee: number
          free_followup_days: number
          max_free_followups: number
          updated_at: string
        }
        Insert: {
          doctor_details_id: string
          followup_fee?: number
          free_followup_days?: number
          max_free_followups?: number
          updated_at?: string
        }
        Update: {
          doctor_details_id?: string
          followup_fee?: number
          free_followup_days?: number
          max_free_followups?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_followup_settings_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: true
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_other_income: {
        Row: {
          amount: number
          created_at: string
          doctor_id: string
          id: string
          note: string | null
          received_at: string
          source_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          doctor_id: string
          id?: string
          note?: string | null
          received_at?: string
          source_type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          doctor_id?: string
          id?: string
          note?: string | null
          received_at?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_other_income_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_outreach: {
        Row: {
          attempt: number
          channel: string
          created_at: string
          error: string | null
          id: string
          provider_message_id: string | null
          scraped_doctor_id: string
          sent_at: string | null
          status: string
          template: string
        }
        Insert: {
          attempt?: number
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          scraped_doctor_id: string
          sent_at?: string | null
          status?: string
          template: string
        }
        Update: {
          attempt?: number
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          scraped_doctor_id?: string
          sent_at?: string | null
          status?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_outreach_scraped_doctor_id_fkey"
            columns: ["scraped_doctor_id"]
            isOneToOne: false
            referencedRelation: "scraped_doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_patients: {
        Row: {
          created_at: string
          doctor_profile_id: string
          id: string
          patient_profile_id: string
        }
        Insert: {
          created_at?: string
          doctor_profile_id: string
          id?: string
          patient_profile_id: string
        }
        Update: {
          created_at?: string
          doctor_profile_id?: string
          id?: string
          patient_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_patients_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_patients_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_private_feedback: {
        Row: {
          ciphertext: string
          created_at: string
          doctor_details_id: string
          doctor_replied_at: string | null
          doctor_reply: string | null
          id: string
          is_anonymous: boolean
          patient_profile_id: string | null
          rating: number | null
        }
        Insert: {
          ciphertext: string
          created_at?: string
          doctor_details_id: string
          doctor_replied_at?: string | null
          doctor_reply?: string | null
          id?: string
          is_anonymous?: boolean
          patient_profile_id?: string | null
          rating?: number | null
        }
        Update: {
          ciphertext?: string
          created_at?: string
          doctor_details_id?: string
          doctor_replied_at?: string | null
          doctor_reply?: string | null
          id?: string
          is_anonymous?: boolean
          patient_profile_id?: string | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_private_feedback_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_private_feedback_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_profile_views: {
        Row: {
          doctor_details_id: string
          viewed_on: string
          views: number
        }
        Insert: {
          doctor_details_id: string
          viewed_on?: string
          views?: number
        }
        Update: {
          doctor_details_id?: string
          viewed_on?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "doctor_profile_views_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_referrals: {
        Row: {
          created_at: string
          id: string
          referred_doctor_id: string
          referrer_doctor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_doctor_id: string
          referrer_doctor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_doctor_id?: string
          referrer_doctor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_referrals_referred_doctor_id_fkey"
            columns: ["referred_doctor_id"]
            isOneToOne: true
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_referrals_referrer_doctor_id_fkey"
            columns: ["referrer_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_shift_closures: {
        Row: {
          closed_for: string
          counted_cash: number
          created_at: string
          difference: number | null
          doctor_id: string
          expected_cash: number
          id: string
          note: string | null
        }
        Insert: {
          closed_for?: string
          counted_cash?: number
          created_at?: string
          difference?: number | null
          doctor_id: string
          expected_cash?: number
          id?: string
          note?: string | null
        }
        Update: {
          closed_for?: string
          counted_cash?: number
          created_at?: string
          difference?: number | null
          doctor_id?: string
          expected_cash?: number
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_shift_closures_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_transactions: {
        Row: {
          appointment_id: string | null
          created_at: string
          currency: string
          description: string | null
          doctor_details_id: string
          gross_amount: number
          id: string
          metadata: Json | null
          net_amount: number
          platform_fee: number
          status: string
          type: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          doctor_details_id: string
          gross_amount: number
          id?: string
          metadata?: Json | null
          net_amount: number
          platform_fee?: number
          status?: string
          type: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          doctor_details_id?: string
          gross_amount?: number
          id?: string
          metadata?: Json | null
          net_amount?: number
          platform_fee?: number
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "doctor_transactions_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_withdrawals: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          currency: string
          doctor_details_id: string
          doctor_note: string | null
          id: string
          method: string
          payout_details_snapshot: Json | null
          processed_at: string | null
          processed_by: string | null
          reference: string | null
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          currency?: string
          doctor_details_id: string
          doctor_note?: string | null
          id?: string
          method: string
          payout_details_snapshot?: Json | null
          processed_at?: string | null
          processed_by?: string | null
          reference?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          currency?: string
          doctor_details_id?: string
          doctor_note?: string | null
          id?: string
          method?: string
          payout_details_snapshot?: Json | null
          processed_at?: string | null
          processed_by?: string | null
          reference?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_withdrawals_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          contact_name: string
          contact_phone: string
          created_at: string
          id: string
          is_primary: boolean
          name: string
          patient_id: string
          phone: string
          relation: string | null
          relationship: string
          updated_at: string
        }
        Insert: {
          contact_name: string
          contact_phone: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          patient_id: string
          phone?: string
          relation?: string | null
          relationship?: string
          updated_at?: string
        }
        Update: {
          contact_name?: string
          contact_phone?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          patient_id?: string
          phone?: string
          relation?: string | null
          relationship?: string
          updated_at?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          context: Json | null
          created_at: string
          fingerprint: string | null
          id: string
          level: string
          message: string
          source: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          fingerprint?: string | null
          id?: string
          level?: string
          message: string
          source: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          fingerprint?: string | null
          id?: string
          level?: string
          message?: string
          source?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          currency_code: string
          name_ar: string | null
          name_en: string | null
          rate_to_usd: number
          symbol: string | null
          updated_at: string
        }
        Insert: {
          currency_code: string
          name_ar?: string | null
          name_en?: string | null
          rate_to_usd: number
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          currency_code?: string
          name_ar?: string | null
          name_en?: string | null
          rate_to_usd?: number
          symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          commission_cents: number
          created_at: string
          currency: string
          customer_name: string | null
          customer_tax_id: string | null
          description: string | null
          doctor_profile_id: string | null
          environment: string
          eta_payload: Json | null
          eta_status: string | null
          eta_submission_uuid: string | null
          id: string
          issued_at: string | null
          net_cents: number
          number: number
          paid_at: string | null
          pdf_url: string | null
          seller_name: string | null
          seller_tax_id: string | null
          status: string
          subscription_id: string | null
          tax_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          commission_cents?: number
          created_at?: string
          currency?: string
          customer_name?: string | null
          customer_tax_id?: string | null
          description?: string | null
          doctor_profile_id?: string | null
          environment?: string
          eta_payload?: Json | null
          eta_status?: string | null
          eta_submission_uuid?: string | null
          id?: string
          issued_at?: string | null
          net_cents?: number
          number?: number
          paid_at?: string | null
          pdf_url?: string | null
          seller_name?: string | null
          seller_tax_id?: string | null
          status?: string
          subscription_id?: string | null
          tax_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          commission_cents?: number
          created_at?: string
          currency?: string
          customer_name?: string | null
          customer_tax_id?: string | null
          description?: string | null
          doctor_profile_id?: string | null
          environment?: string
          eta_payload?: Json | null
          eta_status?: string | null
          eta_submission_uuid?: string | null
          id?: string
          issued_at?: string | null
          net_cents?: number
          number?: number
          paid_at?: string | null
          pdf_url?: string | null
          seller_name?: string | null
          seller_tax_id?: string | null
          status?: string
          subscription_id?: string | null
          tax_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_facilities: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          facility_type: string
          id: string
          is_active: boolean
          is_verified: boolean
          name: string
          owner_user_id: string
          phone: string | null
          profile_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          facility_type?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          name: string
          owner_user_id: string
          phone?: string | null
          profile_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          facility_type?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          name?: string
          owner_user_id?: string
          phone?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_facilities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          amount: number | null
          amount_paid: number
          authorized_doctor_profile_id: string | null
          created_at: string
          id: string
          lab_id: string
          notes: string | null
          ordering_doctor_profile_id: string | null
          patient_authorized: boolean
          patient_profile_id: string
          payment_status: string
          status: string
          test_name: string | null
          test_type: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          amount_paid?: number
          authorized_doctor_profile_id?: string | null
          created_at?: string
          id?: string
          lab_id: string
          notes?: string | null
          ordering_doctor_profile_id?: string | null
          patient_authorized?: boolean
          patient_profile_id: string
          payment_status?: string
          status?: string
          test_name?: string | null
          test_type?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          amount_paid?: number
          authorized_doctor_profile_id?: string | null
          created_at?: string
          id?: string
          lab_id?: string
          notes?: string | null
          ordering_doctor_profile_id?: string | null
          patient_authorized?: boolean
          patient_profile_id?: string
          payment_status?: string
          status?: string
          test_name?: string | null
          test_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_authorized_doctor_profile_id_fkey"
            columns: ["authorized_doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "lab_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_ordering_doctor_profile_id_fkey"
            columns: ["ordering_doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      masked_call_sessions: {
        Row: {
          appointment_id: string | null
          cost_cents: number | null
          created_at: string
          doctor_details_id: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          initiated_by: string
          patient_profile_id: string
          provider: string
          provider_call_sid: string | null
          provider_error: string | null
          proxy_number: string | null
          recording_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["call_status"]
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          cost_cents?: number | null
          created_at?: string
          doctor_details_id: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          initiated_by: string
          patient_profile_id: string
          provider?: string
          provider_call_sid?: string | null
          provider_error?: string | null
          proxy_number?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          cost_cents?: number | null
          created_at?: string
          doctor_details_id?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          initiated_by?: string
          patient_profile_id?: string
          provider?: string
          provider_call_sid?: string | null
          provider_error?: string | null
          proxy_number?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "masked_call_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "masked_call_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "masked_call_sessions_doctor_details_id_fkey"
            columns: ["doctor_details_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "masked_call_sessions_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "masked_call_sessions_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_attachments: {
        Row: {
          appointment_id: string | null
          created_at: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          lab_order_id: string | null
          medical_record_id: string | null
          mime_type: string | null
          notes: string | null
          patient_profile_id: string
          type: string
          uploaded_at: string
          uploaded_by_profile_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          lab_order_id?: string | null
          medical_record_id?: string | null
          mime_type?: string | null
          notes?: string | null
          patient_profile_id: string
          type: string
          uploaded_at?: string
          uploaded_by_profile_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          lab_order_id?: string | null
          medical_record_id?: string | null
          mime_type?: string | null
          notes?: string | null
          patient_profile_id?: string
          type?: string
          uploaded_at?: string
          uploaded_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_attachments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_attachments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "medical_attachments_lab_order_id_fkey"
            columns: ["lab_order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_attachments_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_attachments_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records_patient_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_attachments_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_attachments_uploaded_by_profile_id_fkey"
            columns: ["uploaded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_chars: number | null
          created_at: string
          embedding: string | null
          external_id: string
          fts: unknown
          id: number
          language: string
          section: string | null
          source_id: string
          specialties: string[]
          title: string | null
        }
        Insert: {
          chunk_index?: number
          content: string
          content_chars?: number | null
          created_at?: string
          embedding?: string | null
          external_id?: string
          fts?: unknown
          id?: number
          language?: string
          section?: string | null
          source_id: string
          specialties?: string[]
          title?: string | null
        }
        Update: {
          chunk_index?: number
          content?: string
          content_chars?: number | null
          created_at?: string
          embedding?: string | null
          external_id?: string
          fts?: unknown
          id?: number
          language?: string
          section?: string | null
          source_id?: string
          specialties?: string[]
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "medical_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_ingest_jobs: {
        Row: {
          chunks: number
          created_at: string
          created_by: string | null
          cursor: number
          error: string | null
          id: string
          kind: string
          params: Json
          processed: number
          source_id: string | null
          status: string
          total: number | null
          updated_at: string
        }
        Insert: {
          chunks?: number
          created_at?: string
          created_by?: string | null
          cursor?: number
          error?: string | null
          id?: string
          kind: string
          params?: Json
          processed?: number
          source_id?: string | null
          status?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          chunks?: number
          created_at?: string
          created_by?: string | null
          cursor?: number
          error?: string | null
          id?: string
          kind?: string
          params?: Json
          processed?: number
          source_id?: string | null
          status?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_ingest_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "medical_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_records: {
        Row: {
          appointment_id: string | null
          chief_complaint: string | null
          created_at: string
          diagnosis: string[] | null
          doctor_profile_id: string
          follow_up_days: number | null
          history_present_illness: string | null
          icd10_codes: string[] | null
          id: string
          patient_profile_id: string
          physical_examination: string | null
          private_notes: string | null
          recommended_tests: string[] | null
          treatment_plan: string | null
          updated_at: string
          visit_date: string
          visit_type: string
          vitals: Json | null
        }
        Insert: {
          appointment_id?: string | null
          chief_complaint?: string | null
          created_at?: string
          diagnosis?: string[] | null
          doctor_profile_id: string
          follow_up_days?: number | null
          history_present_illness?: string | null
          icd10_codes?: string[] | null
          id?: string
          patient_profile_id: string
          physical_examination?: string | null
          private_notes?: string | null
          recommended_tests?: string[] | null
          treatment_plan?: string | null
          updated_at?: string
          visit_date?: string
          visit_type?: string
          vitals?: Json | null
        }
        Update: {
          appointment_id?: string | null
          chief_complaint?: string | null
          created_at?: string
          diagnosis?: string[] | null
          doctor_profile_id?: string
          follow_up_days?: number | null
          history_present_illness?: string | null
          icd10_codes?: string[] | null
          id?: string
          patient_profile_id?: string
          physical_examination?: string | null
          private_notes?: string | null
          recommended_tests?: string[] | null
          treatment_plan?: string | null
          updated_at?: string
          visit_date?: string
          visit_type?: string
          vitals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "medical_records_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_reports: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          file_url: string
          id: string
          patient_id: string | null
          report_type: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          file_url: string
          id?: string
          patient_id?: string | null
          report_type?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          file_url?: string
          id?: string
          patient_id?: string | null
          report_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_reports_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_reports_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "medical_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_sources: {
        Row: {
          chunk_count: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          language: string
          license: string
          license_note: string | null
          publisher: string | null
          slug: string
          specialties: string[]
          storage_path: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          chunk_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          language?: string
          license: string
          license_note?: string | null
          publisher?: string | null
          slug: string
          specialties?: string[]
          storage_path?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          chunk_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          language?: string
          license?: string
          license_note?: string | null
          publisher?: string | null
          slug?: string
          specialties?: string[]
          storage_path?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      messaging_opt_outs: {
        Row: {
          channel: string
          created_at: string
          phone_e164: string
          reason: string | null
          source: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          phone_e164: string
          reason?: string | null
          source?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          phone_e164?: string
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      missing_drugs: {
        Row: {
          city: string | null
          created_at: string
          drug_name: string
          id: string
          is_resolved: boolean
          note: string | null
          profile_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          drug_name: string
          id?: string
          is_resolved?: boolean
          note?: string | null
          profile_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          drug_name?: string
          id?: string
          is_resolved?: boolean
          note?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missing_drugs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          link: string | null
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      outbox_messages: {
        Row: {
          attempts: number
          channel: string
          claimed_at: string | null
          consent_basis: string | null
          created_at: string
          dedupe_key: string | null
          delivered_at: string | null
          doctor_profile_id: string | null
          error: string | null
          id: string
          locale: string
          max_attempts: number
          next_attempt_at: string
          params: Json
          patient_profile_id: string | null
          provider: string | null
          provider_message_id: string | null
          provider_status: string | null
          sent_at: string | null
          status: string
          template_key: string
          to_phone: string
        }
        Insert: {
          attempts?: number
          channel?: string
          claimed_at?: string | null
          consent_basis?: string | null
          created_at?: string
          dedupe_key?: string | null
          delivered_at?: string | null
          doctor_profile_id?: string | null
          error?: string | null
          id?: string
          locale?: string
          max_attempts?: number
          next_attempt_at?: string
          params?: Json
          patient_profile_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          sent_at?: string | null
          status?: string
          template_key: string
          to_phone: string
        }
        Update: {
          attempts?: number
          channel?: string
          claimed_at?: string | null
          consent_basis?: string | null
          created_at?: string
          dedupe_key?: string | null
          delivered_at?: string | null
          doctor_profile_id?: string | null
          error?: string | null
          id?: string
          locale?: string
          max_attempts?: number
          next_attempt_at?: string
          params?: Json
          patient_profile_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          sent_at?: string | null
          status?: string
          template_key?: string
          to_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_messages_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_messages_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_addresses: {
        Row: {
          address_line: string
          city: string | null
          created_at: string
          governorate: string | null
          id: string
          is_default: boolean
          is_primary: boolean
          label: string
          lat: number | null
          lng: number | null
          patient_id: string
          updated_at: string
        }
        Insert: {
          address_line: string
          city?: string | null
          created_at?: string
          governorate?: string | null
          id?: string
          is_default?: boolean
          is_primary?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          patient_id: string
          updated_at?: string
        }
        Update: {
          address_line?: string
          city?: string | null
          created_at?: string
          governorate?: string | null
          id?: string
          is_default?: boolean
          is_primary?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          patient_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      patient_appointment_consent: {
        Row: {
          appointment_id: string
          consent_text_version: string
          created_at: string
          data_processing_consent: boolean
          doctor_id: string
          id: string
          ip_address: string | null
          patient_id: string
          recording_consent: boolean
          telemedicine_consent: boolean
          user_agent: string | null
        }
        Insert: {
          appointment_id: string
          consent_text_version?: string
          created_at?: string
          data_processing_consent?: boolean
          doctor_id: string
          id?: string
          ip_address?: string | null
          patient_id: string
          recording_consent?: boolean
          telemedicine_consent?: boolean
          user_agent?: string | null
        }
        Update: {
          appointment_id?: string
          consent_text_version?: string
          created_at?: string
          data_processing_consent?: boolean
          doctor_id?: string
          id?: string
          ip_address?: string | null
          patient_id?: string
          recording_consent?: boolean
          telemedicine_consent?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      patient_claims: {
        Row: {
          created_at: string
          doctor_profile_id: string | null
          expires_at: string
          id: string
          patient_profile_id: string
          token: string
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          doctor_profile_id?: string | null
          expires_at: string
          id?: string
          patient_profile_id: string
          token: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          doctor_profile_id?: string | null
          expires_at?: string
          id?: string
          patient_profile_id?: string
          token?: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_claims_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_claims_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_details: {
        Row: {
          allergies: string[] | null
          blood_type: string | null
          created_at: string
          date_of_birth: string | null
          height_cm: number | null
          id: string
          profile_id: string | null
          updated_at: string
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          allergies?: string[] | null
          blood_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          height_cm?: number | null
          id?: string
          profile_id?: string | null
          updated_at?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          allergies?: string[] | null
          blood_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          height_cm?: number | null
          id?: string
          profile_id?: string | null
          updated_at?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medical_profile: {
        Row: {
          alcohol: boolean | null
          allergies: string[] | null
          blood_type: string | null
          chronic_conditions: string[] | null
          current_medications: string[] | null
          family_history: string | null
          patient_profile_id: string
          smoking: boolean | null
          updated_at: string
        }
        Insert: {
          alcohol?: boolean | null
          allergies?: string[] | null
          blood_type?: string | null
          chronic_conditions?: string[] | null
          current_medications?: string[] | null
          family_history?: string | null
          patient_profile_id: string
          smoking?: boolean | null
          updated_at?: string
        }
        Update: {
          alcohol?: boolean | null
          allergies?: string[] | null
          blood_type?: string | null
          chronic_conditions?: string[] | null
          current_medications?: string[] | null
          family_history?: string | null
          patient_profile_id?: string
          smoking?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_profile_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          created_at: string
          currency: string
          environment: string
          id: string
          invoice_id: string | null
          paid_at: string | null
          provider: string
          provider_payment_id: string | null
          provider_session_id: string | null
          raw_payload: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          environment?: string
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_session_id?: string | null
          raw_payload?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          environment?: string
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_session_id?: string | null
          raw_payload?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_branches: {
        Row: {
          address: string | null
          chain_id: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          phone: string | null
          updated_at: string
          working_hours: Json | null
        }
        Insert: {
          address?: string | null
          chain_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          phone?: string | null
          updated_at?: string
          working_hours?: Json | null
        }
        Update: {
          address?: string | null
          chain_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string | null
          updated_at?: string
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_branches_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_chains"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_chains: {
        Row: {
          created_at: string
          description: string | null
          description_ar: string | null
          id: string
          is_verified: boolean
          license_number: string | null
          logo_url: string | null
          name: string
          name_ar: string | null
          owner_user_id: string
          slug: string
          updated_at: string
          verification_status: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_ar?: string | null
          id?: string
          is_verified?: boolean
          license_number?: string | null
          logo_url?: string | null
          name: string
          name_ar?: string | null
          owner_user_id: string
          slug: string
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          description_ar?: string | null
          id?: string
          is_verified?: boolean
          license_number?: string | null
          logo_url?: string | null
          name?: string
          name_ar?: string | null
          owner_user_id?: string
          slug?: string
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Relationships: []
      }
      pharmacy_drug_listings: {
        Row: {
          alternative_name: string | null
          branch_id: string | null
          chain_id: string
          created_at: string
          currency: string | null
          dosage: string | null
          drug_name: string
          expires_at: string | null
          id: string
          is_active: boolean
          linked_post_id: string | null
          notes: string | null
          price: number | null
          stock_status: string
          updated_at: string
        }
        Insert: {
          alternative_name?: string | null
          branch_id?: string | null
          chain_id: string
          created_at?: string
          currency?: string | null
          dosage?: string | null
          drug_name: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          linked_post_id?: string | null
          notes?: string | null
          price?: number | null
          stock_status?: string
          updated_at?: string
        }
        Update: {
          alternative_name?: string | null
          branch_id?: string | null
          chain_id?: string
          created_at?: string
          currency?: string | null
          dosage?: string | null
          drug_name?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          linked_post_id?: string | null
          notes?: string | null
          price?: number | null
          stock_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_drug_listings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_drug_listings_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_drug_listings_linked_post_id_fkey"
            columns: ["linked_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_medications: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          price: number
          stock_quantity: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          price: number
          stock_quantity?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          price?: number
          stock_quantity?: number | null
        }
        Relationships: []
      }
      post_drug_info: {
        Row: {
          alternative_suggested: string | null
          created_at: string
          dosage: string | null
          drug_name: string
          id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          alternative_suggested?: string | null
          created_at?: string
          dosage?: string | null
          drug_name: string
          id?: string
          post_id: string
          updated_at?: string
        }
        Update: {
          alternative_suggested?: string | null
          created_at?: string
          dosage?: string | null
          drug_name?: string
          id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_drug_info_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_replies: {
        Row: {
          author_profile_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          is_doctor_verified: boolean | null
          parent_reply_id: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          author_profile_id: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          is_doctor_verified?: boolean | null
          parent_reply_id?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          author_profile_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          is_doctor_verified?: boolean | null
          parent_reply_id?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_replies_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "post_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          created_at: string
          id: string
          post_id: string | null
          reason: string
          reply_id: string | null
          reporter_user_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id?: string | null
          reason: string
          reply_id?: string | null
          reporter_user_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string | null
          reason?: string
          reply_id?: string | null
          reporter_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "post_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_profile_id: string
          author_role: string
          body: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_pinned: boolean | null
          is_resolved: boolean | null
          media_urls: string[] | null
          post_type: string
          reactions_count: number | null
          replies_count: number | null
          specialty_id: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author_profile_id: string
          author_role: string
          body: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          is_resolved?: boolean | null
          media_urls?: string[] | null
          post_type: string
          reactions_count?: number | null
          replies_count?: number | null
          specialty_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author_profile_id?: string
          author_role?: string
          body?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          is_resolved?: boolean | null
          media_urls?: string[] | null
          post_type?: string
          reactions_count?: number | null
          replies_count?: number | null
          specialty_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_items: {
        Row: {
          active_ingredient: string | null
          dosage: string
          drug_name: string
          duration: string
          frequency: string
          id: string
          instructions: string | null
          prescription_id: string
          quantity: number | null
          route: string | null
          sort_order: number | null
        }
        Insert: {
          active_ingredient?: string | null
          dosage: string
          drug_name: string
          duration: string
          frequency: string
          id?: string
          instructions?: string | null
          prescription_id: string
          quantity?: number | null
          route?: string | null
          sort_order?: number | null
        }
        Update: {
          active_ingredient?: string | null
          dosage?: string
          drug_name?: string
          duration?: string
          frequency?: string
          id?: string
          instructions?: string | null
          prescription_id?: string
          quantity?: number | null
          route?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string
          id: string
          medical_record_id: string
          notes: string | null
          prescription_number: string
          qr_code_payload: string | null
          status: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          medical_record_id: string
          notes?: string | null
          prescription_number: string
          qr_code_payload?: string | null
          status?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          medical_record_id?: string
          notes?: string | null
          prescription_number?: string
          qr_code_payload?: string | null
          status?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records_patient_view"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_short_links: {
        Row: {
          click_count: number
          created_at: string
          created_by: string | null
          label: string | null
          last_clicked_at: string | null
          profile_id: string
          short_id: string
          target_path: string
        }
        Insert: {
          click_count?: number
          created_at?: string
          created_by?: string | null
          label?: string | null
          last_clicked_at?: string | null
          profile_id: string
          short_id: string
          target_path: string
        }
        Update: {
          click_count?: number
          created_at?: string
          created_by?: string | null
          label?: string | null
          last_clicked_at?: string | null
          profile_id?: string
          short_id?: string
          target_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_short_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          fcm_token: string | null
          full_name: string | null
          id: string
          managed_by_doctor: string | null
          medical_card: Json
          phone: string | null
          phone_e164: string | null
          profile_views_count: number
          profile_visibility: string
          public_banner_url: string | null
          public_bio: string | null
          push_platform: string | null
          shared_care_consent: boolean
          slug: string | null
          social_links: Json
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          fcm_token?: string | null
          full_name?: string | null
          id?: string
          managed_by_doctor?: string | null
          medical_card?: Json
          phone?: string | null
          phone_e164?: string | null
          profile_views_count?: number
          profile_visibility?: string
          public_banner_url?: string | null
          public_bio?: string | null
          push_platform?: string | null
          shared_care_consent?: boolean
          slug?: string | null
          social_links?: Json
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          fcm_token?: string | null
          full_name?: string | null
          id?: string
          managed_by_doctor?: string | null
          medical_card?: Json
          phone?: string | null
          phone_e164?: string | null
          profile_views_count?: number
          profile_visibility?: string
          public_banner_url?: string | null
          public_bio?: string | null
          push_platform?: string | null
          shared_care_consent?: boolean
          slug?: string | null
          social_links?: Json
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      regions: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          level: number
          lng: number | null
          name_ar: string
          name_en: string
          parent_id: string | null
          slug: string
          sort_order: number
          type: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          level: number
          lng?: number | null
          name_ar: string
          name_en: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          type: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          level?: number
          lng?: number | null
          name_ar?: string
          name_en?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          appointment_id: string | null
          comment: string | null
          created_at: string
          doctor_decided_at: string | null
          doctor_id: string
          doctor_response: string | null
          id: string
          is_published_by_doctor: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          patient_id: string
          rating: number
          status: string
        }
        Insert: {
          appointment_id?: string | null
          comment?: string | null
          created_at?: string
          doctor_decided_at?: string | null
          doctor_id: string
          doctor_response?: string | null
          id?: string
          is_published_by_doctor?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          patient_id: string
          rating: number
          status?: string
        }
        Update: {
          appointment_id?: string | null
          comment?: string | null
          created_at?: string
          doctor_decided_at?: string | null
          doctor_id?: string
          doctor_response?: string | null
          id?: string
          is_published_by_doctor?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          patient_id?: string
          rating?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scraped_doctors: {
        Row: {
          address: string | null
          city: string | null
          claim_token: string
          claimed_at: string | null
          claimed_doctor_id: string | null
          external_rating: number | null
          external_review_cnt: number | null
          full_name: string
          governorate: string | null
          id: string
          imported_at: string
          is_claimed: boolean
          lat: number | null
          listing_status: string
          lng: number | null
          opted_out: boolean
          opted_out_at: string | null
          opted_out_reason: string | null
          phone: string | null
          source: string
          source_ref: string | null
          specialty: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          claim_token?: string
          claimed_at?: string | null
          claimed_doctor_id?: string | null
          external_rating?: number | null
          external_review_cnt?: number | null
          full_name: string
          governorate?: string | null
          id?: string
          imported_at?: string
          is_claimed?: boolean
          lat?: number | null
          listing_status?: string
          lng?: number | null
          opted_out?: boolean
          opted_out_at?: string | null
          opted_out_reason?: string | null
          phone?: string | null
          source?: string
          source_ref?: string | null
          specialty?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          claim_token?: string
          claimed_at?: string | null
          claimed_doctor_id?: string | null
          external_rating?: number | null
          external_review_cnt?: number | null
          full_name?: string
          governorate?: string | null
          id?: string
          imported_at?: string
          is_claimed?: boolean
          lat?: number | null
          listing_status?: string
          lng?: number | null
          opted_out?: boolean
          opted_out_at?: string | null
          opted_out_reason?: string | null
          phone?: string | null
          source?: string
          source_ref?: string | null
          specialty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraped_doctors_claimed_doctor_id_fkey"
            columns: ["claimed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
        ]
      }
      specialties: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name_ar: string
          name_en: string
          slug: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name_ar: string
          name_en: string
          slug: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name_ar?: string
          name_en?: string
          slug?: string
        }
        Relationships: []
      }
      sponsored_impressions: {
        Row: {
          cost_cents: number
          doctor_id: string
          event_type: string
          id: string
          occurred_at: string
          position: number | null
          session_hash: string | null
          slot_id: string
        }
        Insert: {
          cost_cents?: number
          doctor_id: string
          event_type?: string
          id?: string
          occurred_at?: string
          position?: number | null
          session_hash?: string | null
          slot_id: string
        }
        Update: {
          cost_cents?: number
          doctor_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          position?: number | null
          session_hash?: string | null
          slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_impressions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_impressions_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "sponsored_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsored_slots: {
        Row: {
          city_id: string | null
          cpc_bid_cents: number
          created_at: string
          daily_cap_cents: number | null
          doctor_id: string
          ends_at: string | null
          governorate_id: string | null
          id: string
          monthly_budget_cents: number
          specialty: string | null
          spent_today_cents: number
          spent_today_date: string
          spent_total_cents: number
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          city_id?: string | null
          cpc_bid_cents?: number
          created_at?: string
          daily_cap_cents?: number | null
          doctor_id: string
          ends_at?: string | null
          governorate_id?: string | null
          id?: string
          monthly_budget_cents: number
          specialty?: string | null
          spent_today_cents?: number
          spent_today_date?: string
          spent_total_cents?: number
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          city_id?: string | null
          cpc_bid_cents?: number
          created_at?: string
          daily_cap_cents?: number | null
          doctor_id?: string
          ends_at?: string | null
          governorate_id?: string | null
          id?: string
          monthly_budget_cents?: number
          specialty?: string | null
          spent_today_cents?: number
          spent_today_date?: string
          spent_total_cents?: number
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_slots_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_slots_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctor_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_slots_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          commission_pct: number
          created_at: string
          currency: string
          description_ar: string | null
          description_en: string | null
          features: Json
          id: string
          interval: string
          is_active: boolean
          name_ar: string
          name_en: string
          price_cents: number
          ranking_boost: number
          sort_order: number
          sponsored_eligible: boolean
          stripe_price_id: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          code: string
          commission_pct?: number
          created_at?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          price_cents: number
          ranking_boost?: number
          sort_order?: number
          sponsored_eligible?: boolean
          stripe_price_id?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          code?: string
          commission_pct?: number
          created_at?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          price_cents?: number
          ranking_boost?: number
          sort_order?: number
          sponsored_eligible?: boolean
          stripe_price_id?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          access_granted_at: string | null
          access_status: string | null
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          is_manual: boolean | null
          plan_code: string | null
          price_id: string
          product_id: string | null
          receipt_url: string | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_granted_at?: string | null
          access_status?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          is_manual?: boolean | null
          plan_code?: string | null
          price_id: string
          product_id?: string | null
          receipt_url?: string | null
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_granted_at?: string | null
          access_status?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          is_manual?: boolean | null
          plan_code?: string | null
          price_id?: string
          product_id?: string | null
          receipt_url?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_response: string | null
          body: string
          category: string
          created_at: string
          id: string
          priority: string
          responded_at: string | null
          responded_by: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          body: string
          category?: string
          created_at?: string
          id?: string
          priority?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          body?: string
          category?: string
          created_at?: string
          id?: string
          priority?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_contacts: {
        Row: {
          created_at: string
          id: string
          phone: string | null
          phone_e164: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone?: string | null
          phone_e164?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone?: string | null
          phone_e164?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      web_vitals_events: {
        Row: {
          connection: string | null
          created_at: string
          delta: number | null
          device_type: string | null
          id: string
          metric: string
          navigation_type: string | null
          path: string
          rating: string
          referrer: string | null
          session_id: string | null
          url: string
          user_agent: string | null
          user_id: string | null
          value: number
          viewport_height: number | null
          viewport_width: number | null
        }
        Insert: {
          connection?: string | null
          created_at?: string
          delta?: number | null
          device_type?: string | null
          id?: string
          metric: string
          navigation_type?: string | null
          path: string
          rating: string
          referrer?: string | null
          session_id?: string | null
          url: string
          user_agent?: string | null
          user_id?: string | null
          value: number
          viewport_height?: number | null
          viewport_width?: number | null
        }
        Update: {
          connection?: string | null
          created_at?: string
          delta?: number | null
          device_type?: string | null
          id?: string
          metric?: string
          navigation_type?: string | null
          path?: string
          rating?: string
          referrer?: string | null
          session_id?: string | null
          url?: string
          user_agent?: string | null
          user_id?: string | null
          value?: number
          viewport_height?: number | null
          viewport_width?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      medical_records_patient_view: {
        Row: {
          appointment_id: string | null
          chief_complaint: string | null
          created_at: string | null
          diagnosis: string[] | null
          doctor_profile_id: string | null
          follow_up_days: number | null
          history_present_illness: string | null
          icd10_codes: string[] | null
          id: string | null
          patient_profile_id: string | null
          physical_examination: string | null
          recommended_tests: string[] | null
          treatment_plan: string | null
          updated_at: string | null
          visit_date: string | null
          visit_type: string | null
          vitals: Json | null
        }
        Insert: {
          appointment_id?: string | null
          chief_complaint?: string | null
          created_at?: string | null
          diagnosis?: string[] | null
          doctor_profile_id?: string | null
          follow_up_days?: number | null
          history_present_illness?: string | null
          icd10_codes?: string[] | null
          id?: string | null
          patient_profile_id?: string | null
          physical_examination?: string | null
          recommended_tests?: string[] | null
          treatment_plan?: string | null
          updated_at?: string | null
          visit_date?: string | null
          visit_type?: string | null
          vitals?: Json | null
        }
        Update: {
          appointment_id?: string | null
          chief_complaint?: string | null
          created_at?: string | null
          diagnosis?: string[] | null
          doctor_profile_id?: string | null
          follow_up_days?: number | null
          history_present_illness?: string | null
          icd10_codes?: string[] | null
          id?: string | null
          patient_profile_id?: string | null
          physical_examination?: string | null
          recommended_tests?: string[] | null
          treatment_plan?: string | null
          updated_at?: string | null
          visit_date?: string | null
          visit_type?: string | null
          vitals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "v_clinic_queue"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "medical_records_doctor_profile_id_fkey"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_clinic_queue: {
        Row: {
          appointment_date: string | null
          appointment_id: string | null
          called_at: string | null
          clinic_id: string | null
          ended_at: string | null
          estimated_start_at: string | null
          queue_number: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          appointment_date?: string | null
          appointment_id?: string | null
          called_at?: string | null
          clinic_id?: string | null
          ended_at?: string | null
          estimated_start_at?: string | null
          queue_number?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          appointment_date?: string | null
          appointment_id?: string | null
          called_at?: string | null
          clinic_id?: string | null
          ended_at?: string | null
          estimated_start_at?: string | null
          queue_number?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      v_doctor_ledger: {
        Row: {
          amount: number | null
          category: string | null
          currency: string | null
          description: string | null
          direction: string | null
          doctor_details_id: string | null
          entry_date: string | null
          source: string | null
          source_id: string | null
        }
        Relationships: []
      }
      web_vitals_summary: {
        Row: {
          good_pct: number | null
          metric: string | null
          p50: number | null
          p75: number | null
          p95: number | null
          path: string | null
          samples: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _caller_doctor_id: { Args: never; Returns: string }
      _claim_token_for: {
        Args: { p_doctor_profile_id: string; p_patient_profile_id: string }
        Returns: string
      }
      _clinic_tz: { Args: { p_clinic_id: string }; Returns: string }
      _col_default_json: {
        Args: { p_col: string; p_table: unknown }
        Returns: Json
      }
      _enqueue_patient_welcome: {
        Args: {
          p_dedupe_key?: string
          p_doctor_profile_id: string
          p_patient_profile_id: string
        }
        Returns: string
      }
      _feedback_key: { Args: { p_doctor_id: string }; Returns: string }
      _fold_managed_shell: {
        Args: { p_shell: string; p_target: string }
        Returns: undefined
      }
      _is_appointment_doctor: {
        Args: { p_clinic_id: string; p_doctor_id: string }
        Returns: boolean
      }
      _is_privileged_writer: { Args: never; Returns: boolean }
      _notify: {
        Args: {
          p_body: string
          p_event_key: string
          p_extra?: Json
          p_kind: string
          p_link: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      _profile_has_data: { Args: { p_profile: string }; Returns: boolean }
      _user_id_from_doctor_details: {
        Args: { p_doctor_id: string }
        Returns: string
      }
      _user_id_from_profile: { Args: { p_profile_id: string }; Returns: string }
      add_managed_patient: {
        Args: {
          p_city?: string
          p_dob?: string
          p_full_name: string
          p_phone?: string
        }
        Returns: string
      }
      adopt_managed_profile_by_phone: { Args: never; Returns: Json }
      advance_queue: {
        Args: { p_clinic_id: string; p_date?: string }
        Returns: {
          appointment_date: string | null
          appointment_type: string
          called_at: string | null
          clinic_id: string | null
          commission_cents: number | null
          consultation_fee_cents: number | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string
          currency: string
          doctor_id: string
          duration_minutes: number
          ended_at: string | null
          estimated_start_at: string | null
          fee: number
          id: string
          invoice_id: string | null
          is_emergency: boolean | null
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_receipt_at: string | null
          payment_receipt_url: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          reminder_email_sent_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          visit_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attribute_referral: { Args: { p_code: string }; Returns: boolean }
      book_queue_appointment:
        | {
            Args: {
              p_appointment_date: string
              p_appointment_type?: string
              p_clinic_id: string
              p_doctor_id: string
              p_notes?: string
            }
            Returns: {
              appointment_date: string | null
              appointment_type: string
              called_at: string | null
              clinic_id: string | null
              commission_cents: number | null
              consultation_fee_cents: number | null
              coupon_code: string | null
              coupon_discount: number | null
              created_at: string
              currency: string
              doctor_id: string
              duration_minutes: number
              ended_at: string | null
              estimated_start_at: string | null
              fee: number
              id: string
              invoice_id: string | null
              is_emergency: boolean | null
              notes: string | null
              paid_at: string | null
              patient_consent_accepted: boolean
              patient_id: string
              payment_environment: string | null
              payment_intent_id: string | null
              payment_method: string | null
              payment_receipt_at: string | null
              payment_receipt_url: string | null
              payment_status: string
              queue_number: number | null
              refunded_amount: number
              refunded_at: string | null
              reminder_email_sent_at: string | null
              scheduled_at: string
              started_at: string | null
              status: string
              updated_at: string
              visit_type: string | null
            }
            SetofOptions: {
              from: "*"
              to: "appointments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_appointment_date: string
              p_appointment_type?: string
              p_clinic_id: string
              p_doctor_id: string
              p_is_emergency?: boolean
              p_notes?: string
            }
            Returns: {
              id: string
              queue_number: number
            }[]
          }
      book_slot_appointment: {
        Args: {
          p_appointment_date: string
          p_appointment_type?: string
          p_clinic_id: string
          p_doctor_id: string
          p_notes?: string
          p_slot_time: string
        }
        Returns: {
          appointment_date: string | null
          appointment_type: string
          called_at: string | null
          clinic_id: string | null
          commission_cents: number | null
          consultation_fee_cents: number | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string
          currency: string
          doctor_id: string
          duration_minutes: number
          ended_at: string | null
          estimated_start_at: string | null
          fee: number
          id: string
          invoice_id: string | null
          is_emergency: boolean | null
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_receipt_at: string | null
          payment_receipt_url: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          reminder_email_sent_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          visit_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_read_profile: { Args: { p_profile_id: string }; Returns: boolean }
      cancel_appointment: {
        Args: { p_appointment_id: string }
        Returns: {
          appointment_date: string | null
          appointment_type: string
          called_at: string | null
          clinic_id: string | null
          commission_cents: number | null
          consultation_fee_cents: number | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string
          currency: string
          doctor_id: string
          duration_minutes: number
          ended_at: string | null
          estimated_start_at: string | null
          fee: number
          id: string
          invoice_id: string | null
          is_emergency: boolean | null
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_receipt_at: string | null
          payment_receipt_url: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          reminder_email_sent_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          visit_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in_appointment: {
        Args: { p_appointment_id: string }
        Returns: {
          appointment_date: string | null
          appointment_type: string
          called_at: string | null
          clinic_id: string | null
          commission_cents: number | null
          consultation_fee_cents: number | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string
          currency: string
          doctor_id: string
          duration_minutes: number
          ended_at: string | null
          estimated_start_at: string | null
          fee: number
          id: string
          invoice_id: string | null
          is_emergency: boolean | null
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_receipt_at: string | null
          payment_receipt_url: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          reminder_email_sent_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          visit_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_managed_profile: { Args: { p_token: string }; Returns: string }
      classify_appointment_visit_type: {
        Args: { p_appointment_id: string }
        Returns: string
      }
      complete_visit: {
        Args: { p_appointment_id: string }
        Returns: {
          appointment_date: string | null
          appointment_type: string
          called_at: string | null
          clinic_id: string | null
          commission_cents: number | null
          consultation_fee_cents: number | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string
          currency: string
          doctor_id: string
          duration_minutes: number
          ended_at: string | null
          estimated_start_at: string | null
          fee: number
          id: string
          invoice_id: string | null
          is_emergency: boolean | null
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_receipt_at: string | null
          payment_receipt_url: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          reminder_email_sent_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          visit_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_appointment_payment: {
        Args: { p_appointment_id: string; p_approve: boolean }
        Returns: undefined
      }
      create_lab_order: {
        Args: {
          p_amount?: number
          p_authorized_doctor_profile_id?: string
          p_lab_id: string
          p_notes?: string
          p_test_name?: string
          p_test_type?: string
        }
        Returns: string
      }
      doctor_active_tier: {
        Args: { doctor_details_id: string }
        Returns: string
      }
      doctor_active_tiers: {
        Args: { _doctor_ids: string[] }
        Returns: {
          doctor_id: string
          tier: string
        }[]
      }
      doctor_book_followup: {
        Args: {
          p_appointment_date?: string
          p_clinic_id?: string
          p_fee?: number
          p_notes?: string
          p_patient_id: string
          p_scheduled_at: string
        }
        Returns: string
      }
      doctor_financial_report: {
        Args: { _doctor_details_id: string; _month: number; _year: number }
        Returns: {
          amount: number
          category: string
          direction: string
        }[]
      }
      doctor_financial_summary: {
        Args: { p_doctor_id: string; p_from?: string; p_to?: string }
        Returns: {
          consult_revenue: number
          net_profit: number
          other_income: number
          total_expenses: number
          total_patients: number
        }[]
      }
      doctor_monthly_pnl: {
        Args: { _doctor_details_id: string; _month: number; _year: number }
        Returns: {
          bookings_count: number
          currency: string
          gross_revenue: number
          net_profit: number
          net_revenue: number
          platform_fees: number
          total_expenses: number
        }[]
      }
      doctor_ranking_score: {
        Args: { doctor_details_id: string }
        Returns: number
      }
      doctor_revenue_series: {
        Args: { _doctor_details_id: string; _months?: number }
        Returns: {
          bookings: number
          expenses: number
          net_income: number
          profit: number
          ym: string
        }[]
      }
      doctor_subscription_status: {
        Args: never
        Returns: {
          current_period_end: string
          days_left: number
          is_lifetime: boolean
          is_trial: boolean
          tier: string
        }[]
      }
      doctor_today_queue_stats: {
        Args: never
        Returns: {
          avg_minutes: number
          waiting_count: number
        }[]
      }
      doctor_wallet_balance: {
        Args: { _doctor_details_id: string }
        Returns: {
          currency: string
          online_net_earned: number
          pending_out: number
          total_paid_out: number
          withdrawable: number
        }[]
      }
      emergency_shift_queue: {
        Args: { p_delay_minutes: number; p_doctor_id: string }
        Returns: number
      }
      enqueue_outbox: {
        Args: {
          p_channel?: string
          p_consent_basis?: string
          p_daily_cap?: number
          p_dedupe_key?: string
          p_doctor?: string
          p_params?: Json
          p_patient?: string
          p_template_key: string
          p_to_phone: string
        }
        Returns: string
      }
      ensure_doctor_trial: { Args: never; Returns: string }
      ensure_referral_code: { Args: never; Returns: string }
      flag_emergency_appointment: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      get_clinic_day_slots: {
        Args: { p_clinic_id: string; p_date: string; p_doctor_id: string }
        Returns: {
          is_past: boolean
          is_taken: boolean
          slot_start_at: string
          slot_time: string
        }[]
      }
      get_doctor_by_slug: {
        Args: { p_slug: string }
        Returns: {
          avatar_url: string
          bio: string
          doctor_id: string
          full_name: string
          is_verified: boolean
          profile_id: string
          solo_brand_color: string
          solo_clinic_name: string
          solo_logo_url: string
          solo_mode_enabled: boolean
          specialty: string
        }[]
      }
      get_due_followup_reminders: {
        Args: never
        Returns: {
          appointment_id: string
          doctor_id: string
          patient_id: string
          patient_name: string
        }[]
      }
      get_managed_patients: {
        Args: never
        Returns: {
          city: string
          date_of_birth: string
          full_name: string
          id: string
          phone: string
        }[]
      }
      get_next_available_slot: {
        Args: {
          p_clinic_id?: string
          p_days_ahead?: number
          p_doctor_id: string
        }
        Returns: {
          avg_minutes: number
          booked_count: number
          clinic_city: string
          clinic_id: string
          clinic_name: string
          day_of_week: number
          end_time: string
          estimated_start_at: string
          max_patients: number
          queue_position_if_book_now: number
          schedule_date: string
          slots_remaining: number
          start_time: string
        }[]
      }
      get_or_create_claim_link: {
        Args: { p_patient_profile_id: string }
        Returns: string
      }
      get_outreach_candidates: {
        Args: { p_limit: number }
        Returns: {
          claim_token: string
          full_name: string
          id: string
          phone: string
          specialty: string
        }[]
      }
      grant_doctor_trial_if_absent: {
        Args: { p_doctor_id: string }
        Returns: undefined
      }
      handle_emergency_booking: {
        Args: { appointment_id: string }
        Returns: undefined
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_finance_pin: { Args: { p_doctor_id: string }; Returns: boolean }
      has_plan: {
        Args: { check_env?: string; plan: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_verified_doctor_profile: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      lab_update_order: {
        Args: {
          p_amount_paid?: number
          p_order_id: string
          p_payment_status?: string
          p_status?: string
        }
        Returns: undefined
      }
      list_appointment_payment_reviews: {
        Args: never
        Returns: {
          appointment_type: string
          currency: string
          doctor_name: string
          fee: number
          id: string
          patient_name: string
          receipt_at: string
          receipt_url: string
          scheduled_at: string
        }[]
      }
      list_care_doctors_for_patient: {
        Args: { p_patient_profile_id: string }
        Returns: {
          doctor_profile_id: string
          full_name: string
          specialty: string
        }[]
      }
      list_my_care_doctors: {
        Args: never
        Returns: {
          doctor_profile_id: string
          full_name: string
          linked_at: string
          specialty: string
        }[]
      }
      list_seeded_doctors: {
        Args: { p_limit?: number }
        Returns: {
          address: string
          city: string
          external_rating: number
          external_review_cnt: number
          full_name: string
          governorate: string
          id: string
          phone: string
          specialty: string
        }[]
      }
      mark_notifications_read: { Args: { _ids: string[] }; Returns: undefined }
      match_medical_chunks: {
        Args: {
          p_embedding: string
          p_language?: string
          p_limit?: number
          p_query?: string
          p_specialties?: string[]
        }
        Returns: {
          content: string
          external_id: string
          id: number
          kind: string
          license: string
          publisher: string
          score: number
          section: string
          similarity: number
          source_id: string
          source_title: string
          title: string
          url: string
        }[]
      }
      my_referral_stats: {
        Args: never
        Returns: {
          referral_code: string
          referred_count: number
        }[]
      }
      next_prescription_number: { Args: never; Returns: string }
      normalize_phone: { Args: { p_raw: string }; Returns: string }
      opt_out_scraped_by_phone: {
        Args: { p_phone: string }
        Returns: undefined
      }
      outbox_claim_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          channel: string
          claimed_at: string | null
          consent_basis: string | null
          created_at: string
          dedupe_key: string | null
          delivered_at: string | null
          doctor_profile_id: string | null
          error: string | null
          id: string
          locale: string
          max_attempts: number
          next_attempt_at: string
          params: Json
          patient_profile_id: string | null
          provider: string | null
          provider_message_id: string | null
          provider_status: string | null
          sent_at: string | null
          status: string
          template_key: string
          to_phone: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      outbox_delivery_update: {
        Args: { p_provider_message_id: string; p_provider_status: string }
        Returns: undefined
      }
      outbox_mark: {
        Args: {
          p_error?: string
          p_id: string
          p_provider?: string
          p_provider_message_id?: string
          p_status: string
        }
        Returns: undefined
      }
      outbox_opt_out: {
        Args: { p_channel?: string; p_phone: string; p_reason?: string }
        Returns: undefined
      }
      preview_claim: {
        Args: { p_token: string }
        Returns: {
          doctor_name: string
          patient_name: string
          valid: boolean
        }[]
      }
      preview_visit_pricing: {
        Args: {
          p_doctor_id: string
          p_patient_id: string
          p_scheduled_at?: string
        }
        Returns: {
          fee: number
          visit_type: string
        }[]
      }
      public_profile_cards: {
        Args: { p_ids: string[] }
        Returns: {
          avatar_url: string
          city: string
          full_name: string
          id: string
        }[]
      }
      rate_ai_consultation: {
        Args: { p_id: string; p_note?: string; p_rating: number }
        Returns: undefined
      }
      read_my_private_feedback: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          doctor_replied_at: string
          doctor_reply: string
          id: string
          is_anonymous: boolean
          message: string
          patient_profile_id: string
          rating: number
        }[]
      }
      read_my_private_feedback_admin: {
        Args: { p_doctor_details_id: string; p_limit?: number }
        Returns: {
          created_at: string
          doctor_replied_at: string
          doctor_reply: string
          id: string
          is_anonymous: boolean
          message: string
          patient_profile_id: string
          rating: number
        }[]
      }
      record_coupon_redemption: {
        Args: { p_appointment_id: string }
        Returns: string
      }
      reply_private_feedback: {
        Args: { p_feedback_id: string; p_reply: string }
        Returns: boolean
      }
      reply_private_feedback_admin: {
        Args: {
          p_doctor_details_id: string
          p_feedback_id: string
          p_reply: string
        }
        Returns: boolean
      }
      request_patient_invite: {
        Args: { p_patient_profile_id: string }
        Returns: Json
      }
      request_withdrawal: {
        Args: { p_amount: number; p_method?: string; p_note?: string }
        Returns: string
      }
      search_doctors_nearby: {
        Args: {
          p_lat: number
          p_lng: number
          p_radius_km?: number
          p_specialty?: string
        }
        Returns: {
          city: string
          clinic_id: string
          clinic_lat: number
          clinic_lng: number
          clinic_name: string
          consultation_fee: number
          distance_km: number
          doctor_id: string
          full_name: string
          rating: number
          specialty: string
        }[]
      }
      set_finance_pin: {
        Args: { p_doctor_id: string; p_pin: string }
        Returns: undefined
      }
      set_lab_order_authorization: {
        Args: {
          p_authorized: boolean
          p_authorized_doctor_profile_id: string
          p_order_id: string
        }
        Returns: undefined
      }
      set_my_messaging_opt_out: {
        Args: { p_opt_out: boolean }
        Returns: undefined
      }
      set_shared_care_consent: {
        Args: { p_consent: boolean }
        Returns: undefined
      }
      start_visit: {
        Args: { p_appointment_id: string }
        Returns: {
          appointment_date: string | null
          appointment_type: string
          called_at: string | null
          clinic_id: string | null
          commission_cents: number | null
          consultation_fee_cents: number | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string
          currency: string
          doctor_id: string
          duration_minutes: number
          ended_at: string | null
          estimated_start_at: string | null
          fee: number
          id: string
          invoice_id: string | null
          is_emergency: boolean | null
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_receipt_at: string | null
          payment_receipt_url: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          reminder_email_sent_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          visit_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_appointment_receipt: {
        Args: { p_appointment_id: string; p_receipt_url: string }
        Returns: undefined
      }
      submit_private_feedback: {
        Args: {
          p_anonymous?: boolean
          p_doctor_details_id: string
          p_message: string
          p_rating?: number
        }
        Returns: string
      }
      submit_private_feedback_admin: {
        Args: {
          p_anonymous?: boolean
          p_doctor_details_id: string
          p_message: string
          p_patient_id: string
          p_rating?: number
        }
        Returns: string
      }
      suggest_unique_slug: { Args: { p_base: string }; Returns: string }
      touch_profile_view: { Args: { p_slug: string }; Returns: undefined }
      touch_short_link: { Args: { p_short_id: string }; Returns: string }
      track_doctor_view: {
        Args: { _doctor_details_id: string }
        Returns: undefined
      }
      unread_notifications_count: { Args: never; Returns: number }
      verify_finance_pin: {
        Args: { p_doctor_id: string; p_pin: string }
        Returns: boolean
      }
      verify_prescription: {
        Args: { _id: string }
        Returns: {
          doctor_license: string
          doctor_name: string
          doctor_signature: string
          doctor_specialty: string
          doctor_stamp: string
          issued_at: string
          items: Json
          notes: string
          patient_initials: string
          prescription_id: string
          prescription_number: string
          status: string
          valid_until: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "doctor"
        | "patient"
        | "pharmacy"
        | "super_admin"
        | "lab"
      call_status:
        | "queued"
        | "ringing"
        | "in_progress"
        | "completed"
        | "failed"
        | "no_answer"
        | "rejected"
      consultation_request_status:
        | "pending_doctor"
        | "proposed"
        | "accepted"
        | "paid"
        | "rejected_by_patient"
        | "rejected_by_doctor"
        | "expired"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "doctor",
        "patient",
        "pharmacy",
        "super_admin",
        "lab",
      ],
      call_status: [
        "queued",
        "ringing",
        "in_progress",
        "completed",
        "failed",
        "no_answer",
        "rejected",
      ],
      consultation_request_status: [
        "pending_doctor",
        "proposed",
        "accepted",
        "paid",
        "rejected_by_patient",
        "rejected_by_doctor",
        "expired",
        "cancelled",
      ],
    },
  },
} as const
