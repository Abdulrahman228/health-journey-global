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
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
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
          notes?: string | null
          paid_at?: string | null
          patient_consent_accepted?: boolean
          patient_id: string
          payment_environment?: string | null
          payment_intent_id?: string | null
          payment_status?: string
          queue_number?: number | null
          refunded_amount?: number
          refunded_at?: string | null
          scheduled_at: string
          started_at?: string | null
          status?: string
          updated_at?: string
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
          notes?: string | null
          paid_at?: string | null
          patient_consent_accepted?: boolean
          patient_id?: string
          payment_environment?: string | null
          payment_intent_id?: string | null
          payment_status?: string
          queue_number?: number | null
          refunded_amount?: number
          refunded_at?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
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
            foreignKeyName: "appointments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
          governorate_id: string | null
          id: string
          is_primary: boolean | null
          landmark: string | null
          lat: number | null
          lng: number | null
          name: string
          phone: string | null
          street: string | null
          updated_at: string
        }
        Insert: {
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
          governorate_id?: string | null
          id?: string
          is_primary?: boolean | null
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          phone?: string | null
          street?: string | null
          updated_at?: string
        }
        Update: {
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
          governorate_id?: string | null
          id?: string
          is_primary?: boolean | null
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string | null
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
          clinic_address: string | null
          clinic_name: string | null
          consultation_fee: number | null
          created_at: string
          credentials_completed_at: string | null
          credentials_review_started_at: string | null
          currency: string | null
          education: string | null
          id: string
          is_pro: boolean
          is_verified: boolean | null
          languages: string[] | null
          national_id_last4: string | null
          pro_plus_active: boolean
          profile_id: string
          rating: number | null
          reviews_count: number
          signature_url: string | null
          solo_brand_color: string | null
          solo_clinic_name: string | null
          solo_logo_url: string | null
          solo_mode_enabled: boolean
          specialty: string | null
          stamp_url: string | null
          syndicate_number: string | null
          telemedicine_enabled: boolean
          updated_at: string
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
          clinic_address?: string | null
          clinic_name?: string | null
          consultation_fee?: number | null
          created_at?: string
          credentials_completed_at?: string | null
          credentials_review_started_at?: string | null
          currency?: string | null
          education?: string | null
          id?: string
          is_pro?: boolean
          is_verified?: boolean | null
          languages?: string[] | null
          national_id_last4?: string | null
          pro_plus_active?: boolean
          profile_id: string
          rating?: number | null
          reviews_count?: number
          signature_url?: string | null
          solo_brand_color?: string | null
          solo_clinic_name?: string | null
          solo_logo_url?: string | null
          solo_mode_enabled?: boolean
          specialty?: string | null
          stamp_url?: string | null
          syndicate_number?: string | null
          telemedicine_enabled?: boolean
          updated_at?: string
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
          clinic_address?: string | null
          clinic_name?: string | null
          consultation_fee?: number | null
          created_at?: string
          credentials_completed_at?: string | null
          credentials_review_started_at?: string | null
          currency?: string | null
          education?: string | null
          id?: string
          is_pro?: boolean
          is_verified?: boolean | null
          languages?: string[] | null
          national_id_last4?: string | null
          pro_plus_active?: boolean
          profile_id?: string
          rating?: number | null
          reviews_count?: number
          signature_url?: string | null
          solo_brand_color?: string | null
          solo_clinic_name?: string | null
          solo_logo_url?: string | null
          solo_mode_enabled?: boolean
          specialty?: string | null
          stamp_url?: string | null
          syndicate_number?: string | null
          telemedicine_enabled?: boolean
          updated_at?: string
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
          doctor_details_id: string
          expense_date: string
          id: string
          receipt_url: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          doctor_details_id: string
          expense_date?: string
          id?: string
          receipt_url?: string | null
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
          doctor_details_id?: string
          expense_date?: string
          id?: string
          receipt_url?: string | null
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
      doctor_private_feedback: {
        Row: {
          ciphertext: string
          created_at: string
          doctor_details_id: string
          id: string
          is_anonymous: boolean
          patient_profile_id: string | null
          rating: number | null
        }
        Insert: {
          ciphertext: string
          created_at?: string
          doctor_details_id: string
          id?: string
          is_anonymous?: boolean
          patient_profile_id?: string | null
          rating?: number | null
        }
        Update: {
          ciphertext?: string
          created_at?: string
          doctor_details_id?: string
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
          created_at: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          medical_record_id: string | null
          mime_type: string | null
          notes: string | null
          patient_profile_id: string
          type: string
          uploaded_at: string
          uploaded_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          medical_record_id?: string | null
          mime_type?: string | null
          notes?: string | null
          patient_profile_id: string
          type: string
          uploaded_at?: string
          uploaded_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
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
      patient_details: {
        Row: {
          allergies: string[] | null
          blood_type: string | null
          created_at: string
          date_of_birth: string | null
          emergency_contact: string | null
          id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string[] | null
          blood_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          id?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string[] | null
          blood_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          id?: string
          profile_id?: string
          updated_at?: string
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
          full_name: string | null
          id: string
          medical_card: Json
          profile_views_count: number
          profile_visibility: string
          public_banner_url: string | null
          public_bio: string | null
          slug: string | null
          social_links: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          medical_card?: Json
          profile_views_count?: number
          profile_visibility?: string
          public_banner_url?: string | null
          public_bio?: string | null
          slug?: string | null
          social_links?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          medical_card?: Json
          profile_views_count?: number
          profile_visibility?: string
          public_banner_url?: string | null
          public_bio?: string | null
          slug?: string | null
          social_links?: Json
          updated_at?: string
          user_id?: string
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
          doctor_id: string
          id: string
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
          doctor_id: string
          id?: string
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
          doctor_id?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          patient_id?: string
          rating?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          plan_code: string | null
          price_id: string
          product_id: string | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          plan_code?: string | null
          price_id: string
          product_id?: string | null
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          plan_code?: string | null
          price_id?: string
          product_id?: string | null
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
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone?: string | null
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
          patient_id: string | null
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
          patient_id?: string | null
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
          patient_id?: string | null
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
      _feedback_key: { Args: { p_doctor_id: string }; Returns: string }
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
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      book_queue_appointment: {
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
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
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
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
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
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
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
      is_admin: { Args: never; Returns: boolean }
      is_verified_doctor_profile: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      mark_notifications_read: { Args: { _ids: string[] }; Returns: undefined }
      next_prescription_number: { Args: never; Returns: string }
      read_my_private_feedback: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
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
          notes: string | null
          paid_at: string | null
          patient_consent_accepted: boolean
          patient_id: string
          payment_environment: string | null
          payment_intent_id: string | null
          payment_status: string
          queue_number: number | null
          refunded_amount: number
          refunded_at: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
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
      app_role: "admin" | "doctor" | "patient" | "pharmacy"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "doctor", "patient", "pharmacy"],
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
