export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          actor_id: string | null
          couple_id: string
          created_at: string
          id: string
          kind: string
          ref_id: string | null
          summary: string
          url: string | null
        }
        Insert: {
          actor_id?: string | null
          couple_id: string
          created_at?: string
          id?: string
          kind: string
          ref_id?: string | null
          summary: string
          url?: string | null
        }
        Update: {
          actor_id?: string | null
          couple_id?: string
          created_at?: string
          id?: string
          kind?: string
          ref_id?: string | null
          summary?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_reads: {
        Row: {
          last_seen_at: string
          profile_id: string
        }
        Insert: {
          last_seen_at?: string
          profile_id: string
        }
        Update: {
          last_seen_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_daily_questions: {
        Row: {
          context_used: Json | null
          couple_id: string
          created_at: string | null
          generated_by: string
          id: string
          question: string | null
          question_date: string
        }
        Insert: {
          context_used?: Json | null
          couple_id: string
          created_at?: string | null
          generated_by: string
          id?: string
          question?: string | null
          question_date?: string
        }
        Update: {
          context_used?: Json | null
          couple_id?: string
          created_at?: string | null
          generated_by?: string
          id?: string
          question?: string | null
          question_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_daily_questions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_date_idea_runs: {
        Row: {
          couple_id: string
          created_at: string
          id: string
          ideas: Json | null
          input: Json
          profile_id: string | null
          status: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          id?: string
          ideas?: Json | null
          input?: Json
          profile_id?: string | null
          status?: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          id?: string
          ideas?: Json | null
          input?: Json
          profile_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_date_idea_runs_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_date_idea_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_results: {
        Row: {
          answers: Json
          couple_id: string | null
          id: string
          profile_id: string
          scores: Json
          taken_at: string
        }
        Insert: {
          answers: Json
          couple_id?: string | null
          id?: string
          profile_id: string
          scores: Json
          taken_at?: string
        }
        Update: {
          answers?: Json
          couple_id?: string | null
          id?: string
          profile_id?: string
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
      bucket_items: {
        Row: {
          category: string
          couple_id: string
          created_at: string
          created_by: string | null
          done_at: string | null
          estimated_cost: number | null
          id: string
          is_done: boolean
          moment_id: string | null
          note: string | null
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          couple_id: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          estimated_cost?: number | null
          id?: string
          is_done?: boolean
          moment_id?: string | null
          note?: string | null
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          couple_id?: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          estimated_cost?: number | null
          id?: string
          is_done?: boolean
          moment_id?: string | null
          note?: string | null
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bucket_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_items_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_events: {
        Row: {
          budget: number | null
          couple_id: string
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          event_scope: string | null
          event_type: string
          id: string
          is_completed: boolean | null
          is_recurring: boolean
          location: string | null
          remind_days_before: number | null
          title: string
        }
        Insert: {
          budget?: number | null
          couple_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date: string
          event_scope?: string | null
          event_type: string
          id?: string
          is_completed?: boolean | null
          is_recurring?: boolean
          location?: string | null
          remind_days_before?: number | null
          title: string
        }
        Update: {
          budget?: number | null
          couple_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_scope?: string | null
          event_type?: string
          id?: string
          is_completed?: boolean | null
          is_recurring?: boolean
          location?: string | null
          remind_days_before?: number | null
          title?: string
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
          couple_id: string
          id: string
          joined_at: string
          profile_id: string
        }
        Insert: {
          couple_id: string
          id?: string
          joined_at?: string
          profile_id: string
        }
        Update: {
          couple_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
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
          couple_id: string
          created_at: string | null
          id: string
          level: number
          name: string
          pet_type: string
          xp: number
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          id?: string
          level?: number
          name: string
          pet_type: string
          xp?: number
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          id?: string
          level?: number
          name?: string
          pet_type?: string
          xp?: number
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
          amount: number
          category: string | null
          couple_id: string
          created_at: string | null
          created_by: string | null
          goal_id: string | null
          id: string
          note: string | null
          type: string
        }
        Insert: {
          amount: number
          category?: string | null
          couple_id: string
          created_at?: string | null
          created_by?: string | null
          goal_id?: string | null
          id?: string
          note?: string | null
          type: string
        }
        Update: {
          amount?: number
          category?: string | null
          couple_id?: string
          created_at?: string | null
          created_by?: string | null
          goal_id?: string | null
          id?: string
          note?: string | null
          type?: string
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
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          invite_expires_at: string
          is_premium: boolean
          unlocked_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code: string
          invite_expires_at?: string
          is_premium?: boolean
          unlocked_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          invite_expires_at?: string
          is_premium?: boolean
          unlocked_at?: string | null
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
          answer: string
          answered_date: string
          couple_id: string
          created_at: string | null
          id: string
          profile_id: string
          question_index: number
        }
        Insert: {
          answer: string
          answered_date?: string
          couple_id: string
          created_at?: string | null
          id?: string
          profile_id: string
          question_index: number
        }
        Update: {
          answer?: string
          answered_date?: string
          couple_id?: string
          created_at?: string | null
          id?: string
          profile_id?: string
          question_index?: number
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
          description: string | null
          id: string
          level_number: number
          pack_id: string
          question_count: number | null
          title: string
        }
        Insert: {
          description?: string | null
          id?: string
          level_number: number
          pack_id: string
          question_count?: number | null
          title: string
        }
        Update: {
          description?: string | null
          id?: string
          level_number?: number
          pack_id?: string
          question_count?: number | null
          title?: string
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
          color: string | null
          created_at: string | null
          description: string | null
          icon_name: string | null
          id: string
          is_free: boolean
          is_published: boolean | null
          slug: string
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon_name?: string | null
          id?: string
          is_free?: boolean
          is_published?: boolean | null
          slug: string
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon_name?: string | null
          id?: string
          is_free?: boolean
          is_published?: boolean | null
          slug?: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      deep_talk_progress: {
        Row: {
          completed_levels: number[]
          couple_id: string
          current_question_index: number
          id: string
          is_completed: boolean | null
          last_played_at: string | null
          level_number: number
          pack_id: string
          started_at: string | null
        }
        Insert: {
          completed_levels?: number[]
          couple_id: string
          current_question_index?: number
          id?: string
          is_completed?: boolean | null
          last_played_at?: string | null
          level_number?: number
          pack_id: string
          started_at?: string | null
        }
        Update: {
          completed_levels?: number[]
          couple_id?: string
          current_question_index?: number
          id?: string
          is_completed?: boolean | null
          last_played_at?: string | null
          level_number?: number
          pack_id?: string
          started_at?: string | null
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
          created_at: string | null
          id: string
          is_active: boolean | null
          level_id: string
          question_text: string
          sort_order: number | null
          target_partner: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level_id: string
          question_text: string
          sort_order?: number | null
          target_partner?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level_id?: string
          question_text?: string
          sort_order?: number | null
          target_partner?: number | null
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
      event_reminders_sent: {
        Row: {
          event_id: string
          occurrence_date: string
          sent_at: string
        }
        Insert: {
          event_id: string
          occurrence_date: string
          sent_at?: string
        }
        Update: {
          event_id?: string
          occurrence_date?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_sent_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "couple_events"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          chapter_id: string
          completed_at: string | null
          couple_id: string
          created_at: string
          created_by: string | null
          id: string
          partner_id: string | null
          round_types: string[]
          rounds: Json
          started_at: string | null
          status: string
          total_score: number
        }
        Insert: {
          chapter_id?: string
          completed_at?: string | null
          couple_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          partner_id?: string | null
          round_types: string[]
          rounds?: Json
          started_at?: string | null
          status?: string
          total_score?: number
        }
        Update: {
          chapter_id?: string
          completed_at?: string | null
          couple_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          partner_id?: string | null
          round_types?: string[]
          rounds?: Json
          started_at?: string | null
          status?: string
          total_score?: number
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
      gratitude_notes: {
        Row: {
          body: string
          couple_id: string
          created_at: string
          from_id: string
          id: string
          opened_at: string | null
          to_id: string
        }
        Insert: {
          body: string
          couple_id: string
          created_at?: string
          from_id: string
          id?: string
          opened_at?: string | null
          to_id: string
        }
        Update: {
          body?: string
          couple_id?: string
          created_at?: string
          from_id?: string
          id?: string
          opened_at?: string | null
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gratitude_notes_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gratitude_notes_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gratitude_notes_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      letters: {
        Row: {
          content: string
          couple_id: string
          created_at: string | null
          id: string
          is_opened: boolean | null
          occasion: string | null
          occasion_label: string | null
          opened_at: string | null
          photo_url: string | null
          receiver_id: string
          sender_id: string
          unlock_date: string
          unlock_notified_at: string | null
        }
        Insert: {
          content: string
          couple_id: string
          created_at?: string | null
          id?: string
          is_opened?: boolean | null
          occasion?: string | null
          occasion_label?: string | null
          opened_at?: string | null
          photo_url?: string | null
          receiver_id: string
          sender_id: string
          unlock_date: string
          unlock_notified_at?: string | null
        }
        Update: {
          content?: string
          couple_id?: string
          created_at?: string | null
          id?: string
          is_opened?: boolean | null
          occasion?: string | null
          occasion_label?: string | null
          opened_at?: string | null
          photo_url?: string | null
          receiver_id?: string
          sender_id?: string
          unlock_date?: string
          unlock_notified_at?: string | null
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
      llm_settings: {
        Row: {
          id: boolean
          key_last4: string | null
          key_set_at: string | null
          key_set_by: string | null
          model: string | null
          test_message: string | null
          test_ok: boolean | null
          tested_at: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          key_last4?: string | null
          key_set_at?: string | null
          key_set_by?: string | null
          model?: string | null
          test_message?: string | null
          test_ok?: boolean | null
          tested_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          key_last4?: string | null
          key_set_at?: string | null
          key_set_by?: string | null
          model?: string | null
          test_message?: string | null
          test_ok?: boolean | null
          tested_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_settings_key_set_by_fkey"
            columns: ["key_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      love_language_results: {
        Row: {
          answers: number[]
          couple_id: string
          profile_id: string
          scores: Json
          taken_at: string
        }
        Insert: {
          answers: number[]
          couple_id: string
          profile_id: string
          scores: Json
          taken_at?: string
        }
        Update: {
          answers?: number[]
          couple_id?: string
          profile_id?: string
          scores?: Json
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "love_language_results_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "love_language_results_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mbti_results: {
        Row: {
          answers: Json
          couple_id: string | null
          id: string
          mbti_type: string
          profile_id: string
          scores: Json
          taken_at: string | null
        }
        Insert: {
          answers: Json
          couple_id?: string | null
          id?: string
          mbti_type: string
          profile_id: string
          scores: Json
          taken_at?: string | null
        }
        Update: {
          answers?: Json
          couple_id?: string | null
          id?: string
          mbti_type?: string
          profile_id?: string
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
          couple_id: string
          created_at: string | null
          id: string
          receiver_id: string
          responded: boolean | null
          responded_at: string | null
          sender_id: string
        }
        Insert: {
          couple_id: string
          created_at?: string | null
          id?: string
          receiver_id: string
          responded?: boolean | null
          responded_at?: string | null
          sender_id: string
        }
        Update: {
          couple_id?: string
          created_at?: string | null
          id?: string
          receiver_id?: string
          responded?: boolean | null
          responded_at?: string | null
          sender_id?: string
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
      moment_comments: {
        Row: {
          body: string
          couple_id: string
          created_at: string
          id: string
          moment_id: string
          profile_id: string | null
        }
        Insert: {
          body: string
          couple_id: string
          created_at?: string
          id?: string
          moment_id: string
          profile_id?: string | null
        }
        Update: {
          body?: string
          couple_id?: string
          created_at?: string
          id?: string
          moment_id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moment_comments_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_comments_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_photos: {
        Row: {
          couple_id: string
          created_at: string
          height: number | null
          id: string
          moment_id: string
          sort_order: number
          storage_path: string
          taken_at: string | null
          width: number | null
        }
        Insert: {
          couple_id: string
          created_at?: string
          height?: number | null
          id?: string
          moment_id: string
          sort_order?: number
          storage_path: string
          taken_at?: string | null
          width?: number | null
        }
        Update: {
          couple_id?: string
          created_at?: string
          height?: number | null
          id?: string
          moment_id?: string
          sort_order?: number
          storage_path?: string
          taken_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "moment_photos_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_photos_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_reactions: {
        Row: {
          couple_id: string
          created_at: string
          emoji: string
          id: string
          moment_id: string
          profile_id: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          emoji: string
          id?: string
          moment_id: string
          profile_id: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          emoji?: string
          id?: string
          moment_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_reactions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_reactions_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moments: {
        Row: {
          couple_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_favorite: boolean
          latitude: number | null
          location_name: string | null
          longitude: number | null
          moment_date: string
          title: string
          updated_at: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          moment_date: string
          title: string
          updated_at?: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          moment_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moments_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_checkins: {
        Row: {
          checkin_date: string
          couple_id: string
          created_at: string
          id: string
          mood: string
          note: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          checkin_date?: string
          couple_id: string
          created_at?: string
          id?: string
          mood: string
          note?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          checkin_date?: string
          couple_id?: string
          created_at?: string
          id?: string
          mood?: string
          note?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_checkins_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mood_checkins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          activity: boolean
          kangen: boolean
          letters: boolean
          moments: boolean
          profile_id: string
          quiet_end: number | null
          quiet_start: number | null
          reminders: boolean
          updated_at: string
        }
        Insert: {
          activity?: boolean
          kangen?: boolean
          letters?: boolean
          moments?: boolean
          profile_id: string
          quiet_end?: number | null
          quiet_start?: number | null
          reminders?: boolean
          updated_at?: string
        }
        Update: {
          activity?: boolean
          kangen?: boolean
          letters?: boolean
          moments?: boolean
          profile_id?: string
          quiet_end?: number | null
          quiet_start?: number | null
          reminders?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_care_logs: {
        Row: {
          action_type: string
          done_at: string | null
          done_by: string | null
          id: string
          pet_id: string
        }
        Insert: {
          action_type: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          pet_id: string
        }
        Update: {
          action_type?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          pet_id?: string
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
          actions: string[]
          couple_id: string
          id: string
          pet_id: string
          profile_id: string
        }
        Insert: {
          actions?: string[]
          couple_id: string
          id?: string
          pet_id: string
          profile_id: string
        }
        Update: {
          actions?: string[]
          couple_id?: string
          id?: string
          pet_id?: string
          profile_id?: string
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
          cleanliness: number
          happiness: number
          hunger: number
          id: string
          mood: string
          pet_id: string
          thriving_since: string | null
          updated_at: string | null
        }
        Insert: {
          cleanliness?: number
          happiness?: number
          hunger?: number
          id?: string
          mood?: string
          pet_id: string
          thriving_since?: string | null
          updated_at?: string | null
        }
        Update: {
          cleanliness?: number
          happiness?: number
          hunger?: number
          id?: string
          mood?: string
          pet_id?: string
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
          avatar_url: string | null
          birthday: string | null
          created_at: string
          gender: string | null
          id: string
          name: string | null
          onboarding_complete: boolean
          relationship_start_date: string | null
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          gender?: string | null
          id: string
          name?: string | null
          onboarding_complete?: boolean
          relationship_start_date?: string | null
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          name?: string | null
          onboarding_complete?: boolean
          relationship_start_date?: string | null
          role?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
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
      savings_entries: {
        Row: {
          amount: number
          couple_id: string
          created_at: string
          goal_id: string
          id: string
          month: string
          note: string | null
        }
        Insert: {
          amount: number
          couple_id: string
          created_at?: string
          goal_id: string
          id?: string
          month: string
          note?: string | null
        }
        Update: {
          amount?: number
          couple_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          month?: string
          note?: string | null
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
          couple_id: string
          created_at: string
          current_amount: number
          id: string
          name: string
          target_amount: number
          target_date: string | null
        }
        Insert: {
          couple_id: string
          created_at?: string
          current_amount?: number
          id?: string
          name: string
          target_amount: number
          target_date?: string | null
        }
        Update: {
          couple_id?: string
          created_at?: string
          current_amount?: number
          id?: string
          name?: string
          target_amount?: number
          target_date?: string | null
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
      spending_results: {
        Row: {
          answers: Json
          couple_id: string | null
          created_at: string | null
          id: string
          profile_id: string
          scores: Json
          spending_type: string
        }
        Insert: {
          answers: Json
          couple_id?: string | null
          created_at?: string | null
          id?: string
          profile_id: string
          scores: Json
          spending_type: string
        }
        Update: {
          answers?: Json
          couple_id?: string | null
          created_at?: string | null
          id?: string
          profile_id?: string
          scores?: Json
          spending_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "spending_results_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spending_results_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      truth_or_dare_cards: {
        Row: {
          body: string
          couple_id: string
          created_at: string
          created_by: string
          heat: string
          id: string
          kind: string
        }
        Insert: {
          body: string
          couple_id: string
          created_at?: string
          created_by: string
          heat: string
          id?: string
          kind: string
        }
        Update: {
          body?: string
          couple_id?: string
          created_at?: string
          created_by?: string
          heat?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "truth_or_dare_cards_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truth_or_dare_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      two_truths_rounds: {
        Row: {
          author_id: string | null
          couple_id: string
          created_at: string
          guess_index: number | null
          guessed_at: string | null
          guessed_by: string | null
          id: string
          lie_index: number
          statements: string[]
          story: string | null
        }
        Insert: {
          author_id?: string | null
          couple_id: string
          created_at?: string
          guess_index?: number | null
          guessed_at?: string | null
          guessed_by?: string | null
          id?: string
          lie_index: number
          statements: string[]
          story?: string | null
        }
        Update: {
          author_id?: string | null
          couple_id?: string
          created_at?: string
          guess_index?: number | null
          guessed_at?: string | null
          guessed_by?: string | null
          id?: string
          lie_index?: number
          statements?: string[]
          story?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "two_truths_rounds_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "two_truths_rounds_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "two_truths_rounds_guessed_by_fkey"
            columns: ["guessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_budget_items: {
        Row: {
          actual_cost: number | null
          category: string
          couple_id: string
          created_at: string
          estimated_cost: number
          id: string
          is_paid: boolean
          name: string
          notes: string | null
          sort_order: number
        }
        Insert: {
          actual_cost?: number | null
          category: string
          couple_id: string
          created_at?: string
          estimated_cost?: number
          id?: string
          is_paid?: boolean
          name: string
          notes?: string | null
          sort_order?: number
        }
        Update: {
          actual_cost?: number | null
          category?: string
          couple_id?: string
          created_at?: string
          estimated_cost?: number
          id?: string
          is_paid?: boolean
          name?: string
          notes?: string | null
          sort_order?: number
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
          couple_id: string
          created_at: string
          id: string
          image_url: string | null
          is_purchased: boolean
          link: string | null
          name: string
          owner_id: string | null
          owner_type: string | null
          price: number | null
        }
        Insert: {
          couple_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_purchased?: boolean
          link?: string | null
          name: string
          owner_id?: string | null
          owner_type?: string | null
          price?: number | null
        }
        Update: {
          couple_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_purchased?: boolean
          link?: string | null
          name?: string
          owner_id?: string | null
          owner_type?: string | null
          price?: number | null
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
      admin_clear_llm_key: { Args: never; Returns: Json }
      admin_llm_status: { Args: never; Returns: Json }
      admin_set_llm_key: { Args: { p_key: string }; Returns: Json }
      admin_set_llm_model: { Args: { p_model: string }; Returns: Json }
      can_access_couple_folder: {
        Args: { object_name: string }
        Returns: boolean
      }
      claim_date_idea_run: {
        Args: {
          p_couple: string
          p_input: Json
          p_limit: number
          p_profile: string
        }
        Returns: string
      }
      complete_deep_talk_level: {
        Args: { p_level_number: number; p_pack_id: string }
        Returns: boolean
      }
      couple_has_data: { Args: { p_couple: string }; Returns: boolean }
      create_couple: {
        Args: never
        Returns: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          invite_expires_at: string
          is_premium: boolean
          unlocked_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "couples"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_invite_code: { Args: never; Returns: string }
      get_my_couple_id: { Args: never; Returns: string }
      has_answered_daily: {
        Args: { p_couple: string; p_date: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_couple_member: { Args: { cid: string }; Returns: boolean }
      join_couple: {
        Args: { p_code: string; p_discard?: boolean }
        Returns: string
      }
      leave_couple: { Args: never; Returns: Json }
      llm_runtime_config: {
        Args: never
        Returns: {
          api_key: string
          model: string
        }[]
      }
      love_language_in_open_couple: {
        Args: { p_couple: string }
        Returns: boolean
      }
      love_language_result_valid: {
        Args: { p_answers: number[]; p_scores: Json }
        Returns: boolean
      }
      moment_in_couple: {
        Args: { p_couple: string; p_moment: string }
        Returns: boolean
      }
      mood_feed_summary: { Args: { p_mood: string }; Returns: string }
      my_couple_is_premium: { Args: never; Returns: boolean }
      my_role: { Args: never; Returns: string }
      perform_pet_care: {
        Args: { p_action: string; p_pet_id: string }
        Returns: Json
      }
      pet_care_rules: { Args: never; Returns: Json }
      pet_mood_of: {
        Args: { c: number; h: number; ha: number }
        Returns: string
      }
      read_letter: {
        Args: { p_letter_id: string }
        Returns: {
          content: string
          id: string
          is_opened: boolean
          opened_at: string
        }[]
      }
      record_llm_test: {
        Args: { p_message: string; p_ok: boolean }
        Returns: undefined
      }
      regenerate_invite_code: {
        Args: never
        Returns: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          invite_expires_at: string
          is_premium: boolean
          unlocked_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "couples"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_push_subscription: {
        Args: { p_auth_key: string; p_endpoint: string; p_p256dh: string }
        Returns: undefined
      }
      shares_couple_with: { Args: { pid: string }; Returns: boolean }
      truth_or_dare_in_open_couple: {
        Args: { p_couple: string }
        Returns: boolean
      }
      two_truths_cancel: { Args: { p_round_id: string }; Returns: undefined }
      two_truths_create: {
        Args: { p_lie_index: number; p_statements: string[]; p_story?: string }
        Returns: string
      }
      two_truths_guess: {
        Args: { p_index: number; p_round_id: string }
        Returns: Json
      }
      two_truths_list: { Args: never; Returns: Json }
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

