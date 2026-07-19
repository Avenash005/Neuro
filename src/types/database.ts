export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      memories: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          kind: string;
          source_url: string | null;
          summary: string | null;
          tags: string[];
          metadata: Json;
          processing_status: string;
          storage_bucket: string | null;
          storage_path: string | null;
          original_filename: string | null;
          mime_type: string | null;
          file_size: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          content?: string;
          kind?: string;
          source_url?: string | null;
          summary?: string | null;
          tags?: string[];
          metadata?: Json;
          processing_status?: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          kind?: string;
          source_url?: string | null;
          summary?: string | null;
          tags?: string[];
          metadata?: Json;
          processing_status?: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      processing_jobs: {
        Row: {
          id: string;
          user_id: string;
          memory_id: string;
          job_type: string;
          status: string;
          attempts: number;
          error_message: string | null;
          available_at: string;
          locked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          memory_id: string;
          job_type: string;
          status?: string;
          attempts?: number;
          error_message?: string | null;
          available_at?: string;
          locked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          attempts?: number;
          error_message?: string | null;
          available_at?: string;
          locked_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      request_processing_retry: {
        Args: { target_memory_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
