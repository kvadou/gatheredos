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
      account_entitlements: {
        Row: {
          created_at: string
          current_period_ends_at: string | null
          granted_at: string
          id: string
          plan: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_ends_at?: string | null
          granted_at?: string
          id?: string
          plan?: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_ends_at?: string | null
          granted_at?: string
          id?: string
          plan?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      care_events: {
        Row: {
          cost: number | null
          created_at: string
          home_id: string
          id: string
          item_id: string | null
          note: string | null
          occurred_on: string
          project_id: string | null
          provenance: Json
          title: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          home_id: string
          id?: string
          item_id?: string | null
          note?: string | null
          occurred_on?: string
          project_id?: string | null
          provenance?: Json
          title: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          home_id?: string
          id?: string
          item_id?: string | null
          note?: string | null
          occurred_on?: string
          project_id?: string | null
          provenance?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_events_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      care_tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          detail: string | null
          due_on: string | null
          home_id: string
          id: string
          item_id: string | null
          priority: string | null
          provenance: Json
          recurrence: string | null
          season: string | null
          source: string
          status: string
          template_slug: string | null
          title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string | null
          home_id: string
          id?: string
          item_id?: string | null
          priority?: string | null
          provenance?: Json
          recurrence?: string | null
          season?: string | null
          source?: string
          status?: string
          template_slug?: string | null
          title: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string | null
          home_id?: string
          id?: string
          item_id?: string | null
          priority?: string | null
          provenance?: Json
          recurrence?: string | null
          season?: string | null
          source?: string
          status?: string
          template_slug?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_tasks_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_tasks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_identifiers: {
        Row: {
          catalog_product_id: string
          created_at: string
          id: string
          kind: string
          provider: string
          value: string
        }
        Insert: {
          catalog_product_id: string
          created_at?: string
          id?: string
          kind: string
          provider: string
          value: string
        }
        Update: {
          catalog_product_id?: string
          created_at?: string
          id?: string
          kind?: string
          provider?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_identifiers_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_products: {
        Row: {
          attributes: Json
          brand: string | null
          category: string | null
          created_at: string
          description: string | null
          fetched_at: string
          id: string
          image_url: string | null
          manufacturer: string | null
          model: string | null
          provider: string
          provider_product_id: string
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          brand?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          model?: string | null
          provider: string
          provider_product_id: string
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          brand?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          model?: string | null
          provider?: string
          provider_product_id?: string
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      contractors: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          home_id: string
          id: string
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          home_id: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          home_id?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractors_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          home_id: string
          id: string
          question: string
          user_id: string
        }
        Insert: {
          created_at?: string
          home_id: string
          id?: string
          question: string
          user_id: string
        }
        Update: {
          created_at?: string
          home_id?: string
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_connections: {
        Row: {
          account_email: string | null
          created_at: string
          id: string
          last_synced_at: string | null
          provider: string
          refresh_token_ciphertext: string
          scopes: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider: string
          refresh_token_ciphertext: string
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token_ciphertext?: string
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          confidence: number | null
          created_at: string
          data: Json
          doc_type: string | null
          error: string | null
          file_id: string | null
          home_id: string
          id: string
          model: string | null
          raw_text: string | null
          search: unknown
          source_kind: string
          source_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          data?: Json
          doc_type?: string | null
          error?: string | null
          file_id?: string | null
          home_id: string
          id?: string
          model?: string | null
          raw_text?: string | null
          search?: unknown
          source_kind?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          data?: Json
          doc_type?: string | null
          error?: string | null
          file_id?: string | null
          home_id?: string
          id?: string
          model?: string | null
          raw_text?: string | null
          search?: unknown
          source_kind?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extractions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extractions_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      field_provenance: {
        Row: {
          confidence: number | null
          created_at: string
          entity_id: string
          entity_table: string
          extraction_id: string | null
          field: string
          home_id: string
          id: string
          model: string | null
          source_kind: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          entity_id: string
          entity_table: string
          extraction_id?: string | null
          field: string
          home_id: string
          id?: string
          model?: string | null
          source_kind: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          entity_id?: string
          entity_table?: string
          extraction_id?: string | null
          field?: string
          home_id?: string
          id?: string
          model?: string | null
          source_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_provenance_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_provenance_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          content_hash: string | null
          created_at: string
          extraction_status: string
          home_id: string
          id: string
          item_id: string | null
          meta: Json
          name: string
          project_id: string | null
          storage_path: string
          taken_at: string | null
          type: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          extraction_status?: string
          home_id: string
          id?: string
          item_id?: string | null
          meta?: Json
          name: string
          project_id?: string | null
          storage_path: string
          taken_at?: string | null
          type: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          extraction_status?: string
          home_id?: string
          id?: string
          item_id?: string | null
          meta?: Json
          name?: string
          project_id?: string | null
          storage_path?: string
          taken_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      home_facts: {
        Row: {
          category: string | null
          confidence: number | null
          created_at: string
          embedding: string | null
          evidence: Json
          home_id: string
          id: string
          is_current: boolean
          object_value: string | null
          predicate: string | null
          source_extraction_id: string | null
          source_kind: string
          statement: string
          subject_id: string | null
          subject_table: string | null
          superseded_by: string | null
        }
        Insert: {
          category?: string | null
          confidence?: number | null
          created_at?: string
          embedding?: string | null
          evidence?: Json
          home_id: string
          id?: string
          is_current?: boolean
          object_value?: string | null
          predicate?: string | null
          source_extraction_id?: string | null
          source_kind?: string
          statement: string
          subject_id?: string | null
          subject_table?: string | null
          superseded_by?: string | null
        }
        Update: {
          category?: string | null
          confidence?: number | null
          created_at?: string
          embedding?: string | null
          evidence?: Json
          home_id?: string
          id?: string
          is_current?: boolean
          object_value?: string | null
          predicate?: string | null
          source_extraction_id?: string | null
          source_kind?: string
          statement?: string
          subject_id?: string | null
          subject_table?: string | null
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "home_facts_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_facts_source_extraction_id_fkey"
            columns: ["source_extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "home_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      home_inbound_addresses: {
        Row: {
          created_at: string
          home_id: string
          rotated_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          home_id: string
          rotated_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          home_id?: string
          rotated_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_inbound_addresses_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: true
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      home_invites: {
        Row: {
          accepted_by: string | null
          created_at: string
          email: string | null
          expires_at: string
          home_id: string
          id: string
          invited_by: string
          role: string
          status: string
          token: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          home_id: string
          id?: string
          invited_by: string
          role?: string
          status?: string
          token?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          home_id?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_invites_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      home_members: {
        Row: {
          created_at: string
          home_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          home_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          home_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_members_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      homes: {
        Row: {
          baths: number | null
          beds: number | null
          city: string | null
          created_at: string
          created_by: string
          features: Json
          goals: Json
          id: string
          name: string
          property_type: string | null
          sqft: number | null
          state: string | null
          street: string | null
          updated_at: string
          year_built: number | null
          zip: string | null
        }
        Insert: {
          baths?: number | null
          beds?: number | null
          city?: string | null
          created_at?: string
          created_by: string
          features?: Json
          goals?: Json
          id?: string
          name: string
          property_type?: string | null
          sqft?: number | null
          state?: string | null
          street?: string | null
          updated_at?: string
          year_built?: number | null
          zip?: string | null
        }
        Update: {
          baths?: number | null
          beds?: number | null
          city?: string | null
          created_at?: string
          created_by?: string
          features?: Json
          goals?: Json
          id?: string
          name?: string
          property_type?: string | null
          sqft?: number | null
          state?: string | null
          street?: string | null
          updated_at?: string
          year_built?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_messages: {
        Row: {
          attachment_file_ids: string[]
          created_at: string
          error: string | null
          external_id: string
          extraction_id: string | null
          from_email: string | null
          from_name: string | null
          home_id: string
          id: string
          proposal_count: number
          provider: string
          sent_at: string | null
          service_address: string | null
          skip_reason: string | null
          status: string
          subject: string | null
          updated_at: string
          user_id: string
          vendor: string | null
        }
        Insert: {
          attachment_file_ids?: string[]
          created_at?: string
          error?: string | null
          external_id: string
          extraction_id?: string | null
          from_email?: string | null
          from_name?: string | null
          home_id: string
          id?: string
          proposal_count?: number
          provider?: string
          sent_at?: string | null
          service_address?: string | null
          skip_reason?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
          vendor?: string | null
        }
        Update: {
          attachment_file_ids?: string[]
          created_at?: string
          error?: string | null
          external_id?: string
          extraction_id?: string | null
          from_email?: string | null
          from_name?: string | null
          home_id?: string
          id?: string
          proposal_count?: number
          provider?: string
          sent_at?: string | null
          service_address?: string | null
          skip_reason?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imported_messages_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_messages_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          action: string | null
          basis: string | null
          category: string
          confidence: number | null
          created_at: string
          dedupe_slug: string | null
          detail: string | null
          evidence: Json
          headline: string
          home_id: string
          id: string
          source: string
          source_extraction_id: string | null
          stat: string | null
          status: string
        }
        Insert: {
          action?: string | null
          basis?: string | null
          category: string
          confidence?: number | null
          created_at?: string
          dedupe_slug?: string | null
          detail?: string | null
          evidence?: Json
          headline: string
          home_id: string
          id?: string
          source?: string
          source_extraction_id?: string | null
          stat?: string | null
          status?: string
        }
        Update: {
          action?: string | null
          basis?: string | null
          category?: string
          confidence?: number | null
          created_at?: string
          dedupe_slug?: string | null
          detail?: string | null
          evidence?: Json
          headline?: string
          home_id?: string
          id?: string
          source?: string
          source_extraction_id?: string | null
          stat?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_source_extraction_id_fkey"
            columns: ["source_extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          catalog_match_confidence: number | null
          catalog_match_source: string | null
          catalog_product_id: string | null
          category: string
          created_at: string
          facts: Json
          home_id: string
          id: string
          installed_on: string | null
          knowledge: Json
          lifespan_years: number | null
          manufacturer: string | null
          model: string | null
          name: string
          room_id: string | null
          serial: string | null
          status: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          catalog_match_confidence?: number | null
          catalog_match_source?: string | null
          catalog_product_id?: string | null
          category: string
          created_at?: string
          facts?: Json
          home_id: string
          id?: string
          installed_on?: string | null
          knowledge?: Json
          lifespan_years?: number | null
          manufacturer?: string | null
          model?: string | null
          name: string
          room_id?: string | null
          serial?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          catalog_match_confidence?: number | null
          catalog_match_source?: string | null
          catalog_product_id?: string | null
          category?: string
          created_at?: string
          facts?: Json
          home_id?: string
          id?: string
          installed_on?: string | null
          knowledge?: Json
          lifespan_years?: number | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          room_id?: string | null
          serial?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: Json
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: Json
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      monetization_research_responses: {
        Row: {
          activated: boolean
          billing_period: string
          created_at: string
          home_id: string | null
          id: string
          plan: string
          price_cents: number
          prompt_key: string
          reason: string | null
          response: string
          surface: string
          user_id: string
          value_theme: string | null
        }
        Insert: {
          activated?: boolean
          billing_period: string
          created_at?: string
          home_id?: string | null
          id?: string
          plan: string
          price_cents: number
          prompt_key: string
          reason?: string | null
          response: string
          surface: string
          user_id: string
          value_theme?: string | null
        }
        Update: {
          activated?: boolean
          billing_period?: string
          created_at?: string
          home_id?: string | null
          id?: string
          plan?: string
          price_cents?: number
          prompt_key?: string
          reason?: string | null
          response?: string
          surface?: string
          user_id?: string
          value_theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monetization_research_responses_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monetization_research_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          home_id: string | null
          id: string
          kind: string
          last_error: string | null
          payload: Json
          provider_id: string | null
          recipient: string
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          home_id?: string | null
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json
          provider_id?: string | null
          recipient: string
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          home_id?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          provider_id?: string | null
          recipient?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          care_reminders: boolean
          created_at: string
          home_id: string
          safety_alerts: boolean
          updated_at: string
          user_id: string
          warranty_alerts: boolean
          weekly_digest: boolean
        }
        Insert: {
          care_reminders?: boolean
          created_at?: string
          home_id: string
          safety_alerts?: boolean
          updated_at?: string
          user_id: string
          warranty_alerts?: boolean
          weekly_digest?: boolean
        }
        Update: {
          care_reminders?: boolean
          created_at?: string
          home_id?: string
          safety_alerts?: boolean
          updated_at?: string
          user_id?: string
          warranty_alerts?: boolean
          weekly_digest?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_admin: boolean
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_admin?: boolean
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean
          name?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number | null
          completed_year: number | null
          contractor_id: string | null
          cost: number | null
          created_at: string
          home_id: string
          id: string
          kind: string
          metadata: Json
          name: string
          progress: number | null
          spent: number | null
          started_on: string | null
          status: string | null
          summary: string | null
          target_end: string | null
          updated_at: string
          value_added: number | null
        }
        Insert: {
          budget?: number | null
          completed_year?: number | null
          contractor_id?: string | null
          cost?: number | null
          created_at?: string
          home_id: string
          id?: string
          kind?: string
          metadata?: Json
          name: string
          progress?: number | null
          spent?: number | null
          started_on?: string | null
          status?: string | null
          summary?: string | null
          target_end?: string | null
          updated_at?: string
          value_added?: number | null
        }
        Update: {
          budget?: number | null
          completed_year?: number | null
          contractor_id?: string | null
          cost?: number | null
          created_at?: string
          home_id?: string
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          progress?: number | null
          spent?: number | null
          started_on?: string | null
          status?: string | null
          summary?: string | null
          target_end?: string | null
          updated_at?: string
          value_added?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_availability: {
        Row: {
          capacity_notes: string | null
          confirmed_at: string
          confirmed_by: string
          created_at: string
          id: string
          next_available_on: string | null
          provider_id: string
          source: string
          status: string
          typical_response_minutes: number | null
          updated_at: string
          valid_until: string
        }
        Insert: {
          capacity_notes?: string | null
          confirmed_at: string
          confirmed_by: string
          created_at?: string
          id?: string
          next_available_on?: string | null
          provider_id: string
          source: string
          status?: string
          typical_response_minutes?: number | null
          updated_at?: string
          valid_until: string
        }
        Update: {
          capacity_notes?: string | null
          confirmed_at?: string
          confirmed_by?: string
          created_at?: string
          id?: string
          next_available_on?: string | null
          provider_id?: string
          source?: string
          status?: string
          typical_response_minutes?: number | null
          updated_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_availability_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_availability_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_businesses: {
        Row: {
          booking_modes: Json
          booking_url: string | null
          brands: Json
          cancellation_policy: string | null
          created_at: string
          diagnostic_policy: Json
          display_name: string
          email: string | null
          id: string
          internal_notes: string | null
          legal_name: string
          parts_labor_warranty: string | null
          phone: string | null
          pilot_market: string
          service_area: Json
          services: Json
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          booking_modes?: Json
          booking_url?: string | null
          brands?: Json
          cancellation_policy?: string | null
          created_at?: string
          diagnostic_policy?: Json
          display_name: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          legal_name: string
          parts_labor_warranty?: string | null
          phone?: string | null
          pilot_market?: string
          service_area?: Json
          services?: Json
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          booking_modes?: Json
          booking_url?: string | null
          brands?: Json
          cancellation_policy?: string | null
          created_at?: string
          diagnostic_policy?: Json
          display_name?: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          legal_name?: string
          parts_labor_warranty?: string | null
          phone?: string | null
          pilot_market?: string
          service_area?: Json
          services?: Json
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      provider_pilot_simulations: {
        Row: {
          created_at: string
          id: string
          notes: string
          performed_at: string
          performed_by: string
          provider_id: string
          response_minutes: number | null
          result: string
          scenario: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes: string
          performed_at?: string
          performed_by: string
          provider_id: string
          response_minutes?: number | null
          result: string
          scenario: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          performed_at?: string
          performed_by?: string
          provider_id?: string
          response_minutes?: number | null
          result?: string
          scenario?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_pilot_simulations_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_pilot_simulations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_requests: {
        Row: {
          channel: string | null
          created_at: string
          decline_reason: string | null
          home_id: string
          id: string
          provider_id: string
          request_payload: Json
          response_summary: Json
          sent_at: string | null
          sent_by: string | null
          service_case_id: string
          source_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          decline_reason?: string | null
          home_id: string
          id?: string
          provider_id: string
          request_payload?: Json
          response_summary?: Json
          sent_at?: string | null
          sent_by?: string | null
          service_case_id: string
          source_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          decline_reason?: string | null
          home_id?: string
          id?: string
          provider_id?: string
          request_payload?: Json
          response_summary?: Json
          sent_at?: string | null
          sent_by?: string | null
          service_case_id?: string
          source_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_requests_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_requests_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_requests_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
          {
            foreignKeyName: "provider_requests_source_message_fk"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "service_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_verifications: {
        Row: {
          created_at: string
          evidence_path: string | null
          expires_at: string | null
          id: string
          kind: string
          notes: string | null
          provider_id: string
          source: string | null
          status: string
          updated_at: string
          value: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          evidence_path?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          notes?: string | null
          provider_id: string
          source?: string | null
          status?: string
          updated_at?: string
          value?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          evidence_path?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          provider_id?: string
          source?: string | null
          status?: string
          updated_at?: string
          value?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_verifications_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          home_id: string
          id: string
          name: string
          slug: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          home_id: string
          id?: string
          name: string
          slug: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          home_id?: string
          id?: string
          name?: string
          slug?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      service_appointments: {
        Row: {
          authorization_id: string
          calendar_event_identifier: string | null
          cancellation_terms_snapshot: string | null
          completion_summary: Json
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          external_reference: string | null
          home_id: string
          id: string
          offer_id: string
          provider_id: string
          service_case_id: string
          status: string
          timezone: string
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          authorization_id: string
          calendar_event_identifier?: string | null
          cancellation_terms_snapshot?: string | null
          completion_summary?: Json
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          external_reference?: string | null
          home_id: string
          id?: string
          offer_id: string
          provider_id: string
          service_case_id: string
          status?: string
          timezone?: string
          updated_at?: string
          window_end: string
          window_start: string
        }
        Update: {
          authorization_id?: string
          calendar_event_identifier?: string | null
          cancellation_terms_snapshot?: string | null
          completion_summary?: Json
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          external_reference?: string | null
          home_id?: string
          id?: string
          offer_id?: string
          provider_id?: string
          service_case_id?: string
          status?: string
          timezone?: string
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_appointments_authorization_id_home_id_fkey"
            columns: ["authorization_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_authorizations"
            referencedColumns: ["id", "home_id"]
          },
          {
            foreignKeyName: "service_appointments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_appointments_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_appointments_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "service_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_appointments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_appointments_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
        ]
      }
      service_authorizations: {
        Row: {
          approved_at: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          home_id: string
          id: string
          kind: string
          revoked_at: string | null
          scope: Json
          scope_hash: string
          service_case_id: string
          status: string
          user_id: string
        }
        Insert: {
          approved_at?: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          home_id: string
          id?: string
          kind: string
          revoked_at?: string | null
          scope: Json
          scope_hash: string
          service_case_id: string
          status?: string
          user_id: string
        }
        Update: {
          approved_at?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          home_id?: string
          id?: string
          kind?: string
          revoked_at?: string | null
          scope?: Json
          scope_hash?: string
          service_case_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_authorizations_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_authorizations_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
          {
            foreignKeyName: "service_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_case_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          authorization_id: string | null
          created_at: string
          home_id: string
          id: number
          idempotency_key: string | null
          metadata: Json
          next_status: string
          prior_status: string | null
          reason: string | null
          service_case_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          authorization_id?: string | null
          created_at?: string
          home_id: string
          id?: never
          idempotency_key?: string | null
          metadata?: Json
          next_status: string
          prior_status?: string | null
          reason?: string | null
          service_case_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          authorization_id?: string | null
          created_at?: string
          home_id?: string
          id?: never
          idempotency_key?: string | null
          metadata?: Json
          next_status?: string
          prior_status?: string | null
          reason?: string | null
          service_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_case_events_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "service_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_case_events_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_case_events_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
        ]
      }
      service_case_files: {
        Row: {
          approved_at: string | null
          approved_for_sharing: boolean
          created_at: string
          file_id: string
          home_id: string
          id: string
          service_case_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_for_sharing?: boolean
          created_at?: string
          file_id: string
          home_id: string
          id?: string
          service_case_id: string
        }
        Update: {
          approved_at?: string | null
          approved_for_sharing?: boolean
          created_at?: string
          file_id?: string
          home_id?: string
          id?: string
          service_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_case_files_file_id_home_id_fkey"
            columns: ["file_id", "home_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "home_id"]
          },
          {
            foreignKeyName: "service_case_files_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_case_files_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
        ]
      }
      service_cases: {
        Row: {
          assigned_operator_id: string | null
          closed_at: string | null
          created_at: string
          home_id: string
          id: string
          item_id: string | null
          item_snapshot: Json
          opened_at: string
          opened_by: string
          preferred_windows: Json
          resolution: string | null
          safety_result: Json
          service_address_snapshot: Json
          service_category: string
          sharing_expires_at: string | null
          sharing_scope: Json
          sharing_status: string
          status: string
          structured_intake: Json
          symptom_summary: string | null
          updated_at: string
          urgency: string
        }
        Insert: {
          assigned_operator_id?: string | null
          closed_at?: string | null
          created_at?: string
          home_id: string
          id?: string
          item_id?: string | null
          item_snapshot?: Json
          opened_at?: string
          opened_by: string
          preferred_windows?: Json
          resolution?: string | null
          safety_result?: Json
          service_address_snapshot?: Json
          service_category?: string
          sharing_expires_at?: string | null
          sharing_scope?: Json
          sharing_status?: string
          status?: string
          structured_intake?: Json
          symptom_summary?: string | null
          updated_at?: string
          urgency?: string
        }
        Update: {
          assigned_operator_id?: string | null
          closed_at?: string | null
          created_at?: string
          home_id?: string
          id?: string
          item_id?: string | null
          item_snapshot?: Json
          opened_at?: string
          opened_by?: string
          preferred_windows?: Json
          resolution?: string | null
          safety_result?: Json
          service_address_snapshot?: Json
          service_category?: string
          sharing_expires_at?: string | null
          sharing_scope?: Json
          sharing_status?: string
          status?: string
          structured_intake?: Json
          symptom_summary?: string | null
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_cases_assigned_operator_id_fkey"
            columns: ["assigned_operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_cases_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_cases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_cases_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_escalations: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          home_id: string
          id: string
          kind: string
          priority: string
          resolved_at: string | null
          resolved_by: string | null
          service_case_id: string
          status: string
          summary: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          home_id: string
          id?: string
          kind: string
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          service_case_id: string
          status?: string
          summary: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          home_id?: string
          id?: string
          kind?: string
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          service_case_id?: string
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_escalations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_escalations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_escalations_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_escalations_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
        ]
      }
      service_messages: {
        Row: {
          actor_id: string | null
          actor_type: string
          body: string | null
          channel: string
          created_at: string
          delivery_status: string | null
          direction: string
          external_id: string | null
          extracted_facts: Json
          home_id: string
          id: string
          provider_request_id: string | null
          recipients: Json
          redacted_body: string | null
          service_case_id: string
          template_key: string | null
          template_version: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          body?: string | null
          channel: string
          created_at?: string
          delivery_status?: string | null
          direction: string
          external_id?: string | null
          extracted_facts?: Json
          home_id: string
          id?: string
          provider_request_id?: string | null
          recipients?: Json
          redacted_body?: string | null
          service_case_id: string
          template_key?: string | null
          template_version?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          body?: string | null
          channel?: string
          created_at?: string
          delivery_status?: string | null
          direction?: string
          external_id?: string | null
          extracted_facts?: Json
          home_id?: string
          id?: string
          provider_request_id?: string | null
          recipients?: Json
          redacted_body?: string | null
          service_case_id?: string
          template_key?: string | null
          template_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_messages_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_messages_provider_request_id_fkey"
            columns: ["provider_request_id"]
            isOneToOne: false
            referencedRelation: "provider_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_messages_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
        ]
      }
      service_offers: {
        Row: {
          availability_source: string | null
          cancellation_terms: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          deposit: number | null
          diagnostic_fee: number | null
          expires_at: string | null
          home_id: string
          id: string
          parts_labor_warranty: string | null
          price_notes: string | null
          provider_question: string | null
          provider_request_id: string
          service_case_id: string
          service_fit: Json
          status: string
          timezone: string
          travel_fee: number | null
          updated_at: string
          visit_type: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          availability_source?: string | null
          cancellation_terms?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          deposit?: number | null
          diagnostic_fee?: number | null
          expires_at?: string | null
          home_id: string
          id?: string
          parts_labor_warranty?: string | null
          price_notes?: string | null
          provider_question?: string | null
          provider_request_id: string
          service_case_id: string
          service_fit?: Json
          status?: string
          timezone?: string
          travel_fee?: number | null
          updated_at?: string
          visit_type?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          availability_source?: string | null
          cancellation_terms?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          deposit?: number | null
          diagnostic_fee?: number | null
          expires_at?: string | null
          home_id?: string
          id?: string
          parts_labor_warranty?: string | null
          price_notes?: string | null
          provider_question?: string | null
          provider_request_id?: string
          service_case_id?: string
          service_fit?: Json
          status?: string
          timezone?: string
          travel_fee?: number | null
          updated_at?: string
          visit_type?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_offers_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offers_provider_request_id_home_id_fkey"
            columns: ["provider_request_id", "home_id"]
            isOneToOne: false
            referencedRelation: "provider_requests"
            referencedColumns: ["id", "home_id"]
          },
          {
            foreignKeyName: "service_offers_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
        ]
      }
      service_outcomes: {
        Row: {
          appointment_id: string
          care_event_id: string | null
          created_at: string
          final_cost: number | null
          home_id: string
          id: string
          invoice_file_id: string | null
          labor_warranty: string | null
          occurred_on: string
          parts_summary: string | null
          private_feedback: string | null
          provider_communication: number | null
          provider_timeliness: number | null
          resolution: string
          service_case_id: string
          status: string
          submitted_by: string
          updated_at: string
          work_performed: string
        }
        Insert: {
          appointment_id: string
          care_event_id?: string | null
          created_at?: string
          final_cost?: number | null
          home_id: string
          id?: string
          invoice_file_id?: string | null
          labor_warranty?: string | null
          occurred_on?: string
          parts_summary?: string | null
          private_feedback?: string | null
          provider_communication?: number | null
          provider_timeliness?: number | null
          resolution: string
          service_case_id: string
          status?: string
          submitted_by: string
          updated_at?: string
          work_performed: string
        }
        Update: {
          appointment_id?: string
          care_event_id?: string | null
          created_at?: string
          final_cost?: number | null
          home_id?: string
          id?: string
          invoice_file_id?: string | null
          labor_warranty?: string | null
          occurred_on?: string
          parts_summary?: string | null
          private_feedback?: string | null
          provider_communication?: number | null
          provider_timeliness?: number | null
          resolution?: string
          service_case_id?: string
          status?: string
          submitted_by?: string
          updated_at?: string
          work_performed?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_outcomes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "service_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_outcomes_care_event_id_fkey"
            columns: ["care_event_id"]
            isOneToOne: false
            referencedRelation: "care_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_outcomes_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_outcomes_invoice_file_id_fkey"
            columns: ["invoice_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_outcomes_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
          {
            foreignKeyName: "service_outcomes_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_quality_reviews: {
        Row: {
          checks: Json
          created_at: string
          decision: string
          home_id: string
          id: string
          notes: string | null
          reviewer_id: string
          service_case_id: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          decision: string
          home_id: string
          id?: string
          notes?: string | null
          reviewer_id: string
          service_case_id: string
        }
        Update: {
          checks?: Json
          created_at?: string
          decision?: string
          home_id?: string
          id?: string
          notes?: string | null
          reviewer_id?: string
          service_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_quality_reviews_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_quality_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_quality_reviews_service_case_id_home_id_fkey"
            columns: ["service_case_id", "home_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "home_id"]
          },
        ]
      }
      suggestions: {
        Row: {
          action: string
          confidence: number
          created_at: string
          dedupe_key: string
          home_id: string
          id: string
          payload: Json
          provenance: Json
          status: string
          summary: string
          target: string
          target_id: string | null
        }
        Insert: {
          action?: string
          confidence: number
          created_at?: string
          dedupe_key: string
          home_id: string
          id?: string
          payload: Json
          provenance?: Json
          status?: string
          summary: string
          target: string
          target_id?: string | null
        }
        Update: {
          action?: string
          confidence?: number
          created_at?: string
          dedupe_key?: string
          home_id?: string
          id?: string
          payload?: Json
          provenance?: Json
          status?: string
          summary?: string
          target?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          created_at: string
          detail: string | null
          home_id: string
          id: string
          kind: string | null
          provenance: Json
          title: string
          year: number
        }
        Insert: {
          created_at?: string
          detail?: string | null
          home_id: string
          id?: string
          kind?: string | null
          provenance?: Json
          title: string
          year: number
        }
        Update: {
          created_at?: string
          detail?: string | null
          home_id?: string
          id?: string
          kind?: string | null
          provenance?: Json
          title?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string
          event: string
          home_id: string | null
          id: number
          props: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          home_id?: string | null
          id?: never
          props?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          home_id?: string | null
          id?: never
          props?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      warranties: {
        Row: {
          confidence: number | null
          coverage: string | null
          created_at: string
          ends_on: string | null
          extraction_id: string | null
          file_id: string | null
          home_id: string
          id: string
          item_id: string | null
          kind: string | null
          notes: string | null
          provider: string | null
          source_kind: string
          starts_on: string | null
          status: string
          term_months: number | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          coverage?: string | null
          created_at?: string
          ends_on?: string | null
          extraction_id?: string | null
          file_id?: string | null
          home_id: string
          id?: string
          item_id?: string | null
          kind?: string | null
          notes?: string | null
          provider?: string | null
          source_kind?: string
          starts_on?: string | null
          status?: string
          term_months?: number | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          coverage?: string | null
          created_at?: string
          ends_on?: string | null
          extraction_id?: string | null
          file_id?: string | null
          home_id?: string
          id?: string
          item_id?: string | null
          kind?: string | null
          notes?: string | null
          provider?: string | null
          source_kind?: string
          starts_on?: string | null
          status?: string
          term_months?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranties_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      authorize_household_service_booking: {
        Args: { p_case_id: string; p_offer_id: string }
        Returns: Json
      }
      consume_service_authorization: {
        Args: { p_authorization_id: string; p_scope_hash: string }
        Returns: {
          approved_at: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          home_id: string
          id: string
          kind: string
          revoked_at: string | null
          scope: Json
          scope_hash: string
          service_case_id: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "service_authorizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_household_service_intake: {
        Args: {
          p_file_ids?: string[]
          p_home_id: string
          p_item_id: string
          p_item_snapshot: Json
          p_preferred_windows: Json
          p_safety_result: Json
          p_service_address_snapshot: Json
          p_share_approved: boolean
          p_structured_intake: Json
          p_symptom_summary: string
          p_urgency: string
        }
        Returns: {
          assigned_operator_id: string | null
          closed_at: string | null
          created_at: string
          home_id: string
          id: string
          item_id: string | null
          item_snapshot: Json
          opened_at: string
          opened_by: string
          preferred_windows: Json
          resolution: string | null
          safety_result: Json
          service_address_snapshot: Json
          service_category: string
          sharing_expires_at: string | null
          sharing_scope: Json
          sharing_status: string
          status: string
          structured_intake: Json
          symptom_summary: string | null
          updated_at: string
          urgency: string
        }
        SetofOptions: {
          from: "*"
          to: "service_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_household_service_case: { Args: { p_case_id: string }; Returns: Json }
      is_home_member: { Args: { home: string }; Returns: boolean }
      is_home_owner: { Args: { home: string }; Returns: boolean }
      is_home_writer: { Args: { home: string }; Returns: boolean }
      is_valid_service_case_transition: {
        Args: { from_status: string; to_status: string }
        Returns: boolean
      }
      record_household_calendar_event: {
        Args: { p_case_id: string; p_identifier: string }
        Returns: undefined
      }
      record_household_service_outcome: {
        Args: {
          p_case_id: string
          p_final_cost?: number
          p_invoice_file_id?: string
          p_labor_warranty?: string
          p_occurred_on?: string
          p_parts_summary?: string
          p_private_feedback?: string
          p_provider_communication?: number
          p_provider_timeliness?: number
          p_resolution: string
          p_work_performed: string
        }
        Returns: {
          appointment_id: string
          care_event_id: string | null
          created_at: string
          final_cost: number | null
          home_id: string
          id: string
          invoice_file_id: string | null
          labor_warranty: string | null
          occurred_on: string
          parts_summary: string | null
          private_feedback: string | null
          provider_communication: number | null
          provider_timeliness: number | null
          resolution: string
          service_case_id: string
          status: string
          submitted_by: string
          updated_at: string
          work_performed: string
        }
        SetofOptions: {
          from: "*"
          to: "service_outcomes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_household_service_exception: {
        Args: { p_case_id: string; p_kind: string; p_note: string }
        Returns: undefined
      }
      shares_home_with: { Args: { other: string }; Returns: boolean }
      transition_service_case: {
        Args: {
          p_actor_id?: string
          p_actor_type: string
          p_authorization_id?: string
          p_case_id: string
          p_expected_status: string
          p_idempotency_key?: string
          p_metadata?: Json
          p_next_status: string
          p_reason?: string
        }
        Returns: {
          assigned_operator_id: string | null
          closed_at: string | null
          created_at: string
          home_id: string
          id: string
          item_id: string | null
          item_snapshot: Json
          opened_at: string
          opened_by: string
          preferred_windows: Json
          resolution: string | null
          safety_result: Json
          service_address_snapshot: Json
          service_category: string
          sharing_expires_at: string | null
          sharing_scope: Json
          sharing_status: string
          status: string
          structured_intake: Json
          symptom_summary: string | null
          updated_at: string
          urgency: string
        }
        SetofOptions: {
          from: "*"
          to: "service_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
