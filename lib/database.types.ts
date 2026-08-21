export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.15" };
  public: {
    Tables: {
      brands: {
        Row: { id: string; user_id: string; name: string; slug: string; logo_url: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; name: string; slug: string; logo_url?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; name?: string; slug?: string; logo_url?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      post_drafts: {
        Row: { id: string; user_id: string; brand_id: string; title: string | null; message: string | null; media_urls: string[]; platforms: string[]; status: string; scheduled_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; brand_id: string; title?: string | null; message?: string | null; media_urls?: string[]; platforms?: string[]; status?: string; scheduled_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; brand_id?: string; title?: string | null; message?: string | null; media_urls?: string[]; platforms?: string[]; status?: string; scheduled_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: [{ foreignKeyName: "post_drafts_brand_id_fkey"; columns: ["brand_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id"] }];
      };
      publishing_history: {
        Row: { id: string; user_id: string; brand_id: string | null; social_account_id: string | null; draft_id: string | null; platform: string; platform_post_id: string | null; message: string | null; status: string; error_message: string | null; published_at: string | null; created_at: string };
        Insert: { id?: string; user_id: string; brand_id?: string | null; social_account_id?: string | null; draft_id?: string | null; platform: string; platform_post_id?: string | null; message?: string | null; status: string; error_message?: string | null; published_at?: string | null; created_at?: string };
        Update: { id?: string; user_id?: string; brand_id?: string | null; social_account_id?: string | null; draft_id?: string | null; platform?: string; platform_post_id?: string | null; message?: string | null; status?: string; error_message?: string | null; published_at?: string | null; created_at?: string };
        Relationships: [];
      };
      scheduled_posts: {
        Row: { id: string; user_id: string; brand_id: string; account_ids: string[]; caption: string; link: string | null; media_url: string | null; scheduled_for: string; status: string; attempts: number; last_error: string | null; published_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; brand_id: string; account_ids?: string[]; caption?: string; link?: string | null; media_url?: string | null; scheduled_for: string; status?: string; attempts?: number; last_error?: string | null; published_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; brand_id?: string; account_ids?: string[]; caption?: string; link?: string | null; media_url?: string | null; scheduled_for?: string; status?: string; attempts?: number; last_error?: string | null; published_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: [{ foreignKeyName: "scheduled_posts_brand_id_fkey"; columns: ["brand_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id"] }];
      };
      social_accounts: {
        Row: { id: string; user_id: string; platform: string; name: string; handle: string | null; platform_account_id: string; access_token: string | null; status: string; created_at: string; updated_at: string; refresh_token: string | null; token_expires_at: string | null; brand_id: string | null; token_checked_at: string | null; token_last_refreshed_at: string | null; token_error: string | null };
        Insert: { id?: string; user_id: string; platform: string; name: string; handle?: string | null; platform_account_id: string; access_token?: string | null; status?: string; created_at?: string; updated_at?: string; refresh_token?: string | null; token_expires_at?: string | null; brand_id?: string | null; token_checked_at?: string | null; token_last_refreshed_at?: string | null; token_error?: string | null };
        Update: { id?: string; user_id?: string; platform?: string; name?: string; handle?: string | null; platform_account_id?: string; access_token?: string | null; status?: string; created_at?: string; updated_at?: string; refresh_token?: string | null; token_expires_at?: string | null; brand_id?: string | null; token_checked_at?: string | null; token_last_refreshed_at?: string | null; token_error?: string | null };
        Relationships: [{ foreignKeyName: "social_accounts_brand_id_fkey"; columns: ["brand_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id"] }];
      };
      social_posts: {
        Row: { id: string; user_id: string; brand_id: string | null; social_account_id: string | null; platform: string; platform_post_id: string | null; message: string; media_type: string; status: string; published_at: string | null; created_at: string; updated_at: string; link: string | null; attempted_at: string | null; error_message: string | null; platform_response: Json | null };
        Insert: { id?: string; user_id: string; brand_id?: string | null; social_account_id?: string | null; platform: string; platform_post_id?: string | null; message?: string; media_type?: string; status?: string; published_at?: string | null; created_at?: string; updated_at?: string; link?: string | null; attempted_at?: string | null; error_message?: string | null; platform_response?: Json | null };
        Update: { id?: string; user_id?: string; brand_id?: string | null; social_account_id?: string | null; platform?: string; platform_post_id?: string | null; message?: string; media_type?: string; status?: string; published_at?: string | null; created_at?: string; updated_at?: string; link?: string | null; attempted_at?: string | null; error_message?: string | null; platform_response?: Json | null };
        Relationships: [
          { foreignKeyName: "social_posts_brand_id_fkey"; columns: ["brand_id"]; isOneToOne: false; referencedRelation: "brands"; referencedColumns: ["id"] },
          { foreignKeyName: "social_posts_social_account_id_fkey"; columns: ["social_account_id"]; isOneToOne: false; referencedRelation: "social_accounts"; referencedColumns: ["id"] }
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
