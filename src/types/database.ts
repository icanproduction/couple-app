export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_daily_questions: {
        Row: { id: string; couple_id: string; question_date: string; question: string; context_used: Json | null; generated_by: string; created_at: string | null }
        Insert: { id?: string; couple_id: string; question_date?: string; question: string; context_used?: Json | null; generated_by: string; created_at?: string | null }
        Update: { id?: string; couple_id?: string; question_date?: string; question?: string; context_used?: Json | null; generated_by?: string; created_at?: string | null }
        Relationships: [{ foreignKeyName: "ai_daily_questions_couple_id_fkey"; columns: ["couple_id"]; isOneToOne: false; referencedRelation: "couples"; referencedColumns: ["id"] }]
      }
      assessment_results: {
        Row: {
          id: string
          profile_id: string
          couple_id: string | null
          answers: Json
          scores: Json
          taken_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          couple_id?: string | null
          answers: Json
          scores: Json
          taken_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          couple_id?: string | null
          answers?: Json
          scores?: Json
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_results_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_results_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_events: {
        Row: {
          id: string
          couple_id: string
          title: string
          event_date: string
          event_type: string
          is_recurring: boolean
          created_at: string
          description: string | null
          location: string | null
          event_scope: string | null
          budget: number | null
          is_completed: boolean | null
          created_by: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          title: string
          event_date: string
          event_type: string
          is_recurring?: boolean
          created_at?: string
          description?: string | null
          location?: string | null
          event_scope?: string | null
          budget?: number | null
          is_completed?: boolean | null
          created_by?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          title?: string
          event_date?: string
          event_type?: string
          is_recurring?: boolean
          created_at?: string
          description?: string | null
          location?: string | null
          event_scope?: string | null
          budget?: number | null
          is_completed?: boolean | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couple_events_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_members: {
        Row: {
          id: string
          couple_id: string
          profile_id: string
          joined_at: string
        }
        Insert: {
          id?: string
          couple_id: string
          profile_id: string
          joined_at?: string
        }
        Update: {
          id?: string
          couple_id?: string
          profile_id?: string
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "couple_members_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_pets: {
        Row: {
          id: string
          couple_id: string
          pet_type: string
          name: string
          level: number
          xp: number
          created_at: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          pet_type: string
          name: string
          level?: number
          xp?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          pet_type?: string
          name?: string
          level?: number
          xp?: number
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couple_pets_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_transactions: {
        Row: {
          id: string
          couple_id: string
          goal_id: string | null
          amount: number
          type: string
          category: string | null
          note: string | null
          created_by: string
          created_at: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          goal_id?: string | null
          amount: number
          type: string
          category?: string | null
          note?: string | null
          created_by: string
          created_at?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          goal_id?: string | null
          amount?: number
          type?: string
          category?: string | null
          note?: string | null
          created_by?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couple_transactions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_transactions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          id: string
          created_by: string
          invite_code: string
          created_at: string
        }
        Insert: {
          id?: string
          created_by: string
          invite_code: string
          created_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          invite_code?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "couples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_responses: {
        Row: {
          id: string
          couple_id: string
          profile_id: string
          question_index: number
          answer: string
          answered_date: string
          created_at: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          profile_id: string
          question_index: number
          answer: string
          answered_date?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          profile_id?: string
          question_index?: number
          answer?: string
          answered_date?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_responses_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_talk_levels: {
        Row: {
          id: string
          pack_id: string
          level_number: number
          title: string
          description: string | null
          question_count: number | null
        }
        Insert: {
          id?: string
          pack_id: string
          level_number: number
          title: string
          description?: string | null
          question_count?: number | null
        }
        Update: {
          id?: string
          pack_id?: string
          level_number?: number
          title?: string
          description?: string | null
          question_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deep_talk_levels_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "deep_talk_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_talk_packs: {
        Row: {
          id: string
          slug: string
          title: string
          description: string | null
          icon_name: string | null
          color: string | null
          sort_order: number | null
          is_published: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          slug: string
          title: string
          description?: string | null
          icon_name?: string | null
          color?: string | null
          sort_order?: number | null
          is_published?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          description?: string | null
          icon_name?: string | null
          color?: string | null
          sort_order?: number | null
          is_published?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      deep_talk_progress: {
        Row: {
          id: string
          couple_id: string
          pack_id: string
          level_number: number
          current_question_index: number
          completed_levels: number[]
          is_completed: boolean | null
          started_at: string | null
          last_played_at: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          pack_id: string
          level_number?: number
          current_question_index?: number
          completed_levels?: number[]
          is_completed?: boolean | null
          started_at?: string | null
          last_played_at?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          pack_id?: string
          level_number?: number
          current_question_index?: number
          completed_levels?: number[]
          is_completed?: boolean | null
          started_at?: string | null
          last_played_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deep_talk_progress_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_talk_progress_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "deep_talk_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_talk_questions: {
        Row: {
          id: string
          level_id: string
          question_text: string
          sort_order: number | null
          target_partner: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          level_id: string
          question_text: string
          sort_order?: number | null
          target_partner?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          level_id?: string
          question_text?: string
          sort_order?: number | null
          target_partner?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deep_talk_questions_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "deep_talk_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          id: string
          couple_id: string
          created_by: string
          partner_id: string | null
          chapter_id: string
          status: string
          rounds: Json
          round_types: string[]
          total_score: number
          created_at: string
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          created_by: string
          partner_id?: string | null
          chapter_id?: string
          status?: string
          rounds: Json
          round_types: string[]
          total_score?: number
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          created_by?: string
          partner_id?: string | null
          chapter_id?: string
          status?: string
          rounds?: Json
          round_types?: string[]
          total_score?: number
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      letters: {
        Row: {
          id: string
          couple_id: string
          sender_id: string
          receiver_id: string
          content: string
          photo_url: string | null
          occasion: string | null
          occasion_label: string | null
          unlock_date: string
          is_opened: boolean | null
          opened_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          sender_id: string
          receiver_id: string
          content: string
          photo_url?: string | null
          occasion?: string | null
          occasion_label?: string | null
          unlock_date: string
          is_opened?: boolean | null
          opened_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          sender_id?: string
          receiver_id?: string
          content?: string
          photo_url?: string | null
          occasion?: string | null
          occasion_label?: string | null
          unlock_date?: string
          is_opened?: boolean | null
          opened_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "letters_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mbti_results: {
        Row: {
          id: string
          profile_id: string
          couple_id: string | null
          mbti_type: string
          answers: Json
          scores: Json
          taken_at: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          couple_id?: string | null
          mbti_type: string
          answers: Json
          scores: Json
          taken_at?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          couple_id?: string | null
          mbti_type?: string
          answers?: Json
          scores?: Json
          taken_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mbti_results_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mbti_results_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      miss_you: {
        Row: {
          id: string
          couple_id: string
          sender_id: string
          receiver_id: string
          responded: boolean | null
          responded_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          sender_id: string
          receiver_id: string
          responded?: boolean | null
          responded_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          sender_id?: string
          receiver_id?: string
          responded?: boolean | null
          responded_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "miss_you_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miss_you_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miss_you_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_care_logs: {
        Row: {
          id: string
          pet_id: string
          action_type: string
          done_by: string
          done_at: string | null
        }
        Insert: {
          id?: string
          pet_id: string
          action_type: string
          done_by: string
          done_at?: string | null
        }
        Update: {
          id?: string
          pet_id?: string
          action_type?: string
          done_by?: string
          done_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_care_logs_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_care_logs_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "couple_pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_care_roles: {
        Row: {
          id: string
          couple_id: string
          pet_id: string
          profile_id: string
          actions: string[]
        }
        Insert: {
          id?: string
          couple_id: string
          pet_id: string
          profile_id: string
          actions: string[]
        }
        Update: {
          id?: string
          couple_id?: string
          pet_id?: string
          profile_id?: string
          actions?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "pet_care_roles_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_care_roles_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "couple_pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_care_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_mood_state: {
        Row: {
          id: string
          pet_id: string
          mood: string
          hunger: number
          happiness: number
          cleanliness: number
          thriving_since: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          pet_id: string
          mood?: string
          hunger?: number
          happiness?: number
          cleanliness?: number
          thriving_since?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          pet_id?: string
          mood?: string
          hunger?: number
          happiness?: number
          cleanliness?: number
          thriving_since?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_mood_state_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "couple_pets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          name: string | null
          birthday: string | null
          relationship_start_date: string | null
          avatar_url: string | null
          onboarding_complete: boolean
          created_at: string
          role: string | null
          gender: string | null
        }
        Insert: {
          id: string
          name?: string | null
          birthday?: string | null
          relationship_start_date?: string | null
          avatar_url?: string | null
          onboarding_complete?: boolean
          created_at?: string
          role?: string | null
          gender?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          birthday?: string | null
          relationship_start_date?: string | null
          avatar_url?: string | null
          onboarding_complete?: boolean
          created_at?: string
          role?: string | null
          gender?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth_key: string
          created_at: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth_key: string
          created_at?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          endpoint?: string
          p256dh?: string
          auth_key?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spending_results: {
        Row: { id: string; couple_id: string; profile_id: string; spending_type: string; scores: Json; answers: Json; created_at: string | null }
        Insert: { id?: string; couple_id: string; profile_id: string; spending_type: string; scores: Json; answers: Json; created_at?: string | null }
        Update: { id?: string; couple_id?: string; profile_id?: string; spending_type?: string; scores?: Json; answers?: Json; created_at?: string | null }
        Relationships: []
      }
      savings_entries: {
        Row: {
          id: string
          goal_id: string
          couple_id: string
          amount: number
          month: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          goal_id: string
          couple_id: string
          amount: number
          month: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          goal_id?: string
          couple_id?: string
          amount?: number
          month?: string
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_entries_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_entries_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          id: string
          couple_id: string
          name: string
          target_amount: number
          current_amount: number
          target_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          couple_id: string
          name: string
          target_amount: number
          current_amount?: number
          target_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          couple_id?: string
          name?: string
          target_amount?: number
          current_amount?: number
          target_date?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_budget_items: {
        Row: {
          id: string
          couple_id: string
          category: string
          name: string
          estimated_cost: number
          actual_cost: number | null
          is_paid: boolean
          notes: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          couple_id: string
          category: string
          name: string
          estimated_cost?: number
          actual_cost?: number | null
          is_paid?: boolean
          notes?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          couple_id?: string
          category?: string
          name?: string
          estimated_cost?: number
          actual_cost?: number | null
          is_paid?: boolean
          notes?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_budget_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          id: string
          couple_id: string
          name: string
          price: number | null
          is_purchased: boolean
          created_at: string
          owner_type: string | null
          owner_id: string | null
          link: string | null
          image_url: string | null
        }
        Insert: {
          id?: string
          couple_id: string
          name: string
          price?: number | null
          is_purchased?: boolean
          created_at?: string
          owner_type?: string | null
          owner_id?: string | null
          link?: string | null
          image_url?: string | null
        }
        Update: {
          id?: string
          couple_id?: string
          name?: string
          price?: number | null
          is_purchased?: boolean
          created_at?: string
          owner_type?: string | null
          owner_id?: string | null
          link?: string | null
          image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
