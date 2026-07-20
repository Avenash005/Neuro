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
          extracted_text: string | null;
          extracted_at: string | null;
          embedding: string | null;
          embedding_model: string | null;
          embedded_at: string | null;
          search_document: string | null;
          is_favorite: boolean;
          content_fingerprint: string | null;
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
          extracted_text?: string | null;
          extracted_at?: string | null;
          embedding?: string | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          is_favorite?: boolean;
          content_fingerprint?: string | null;
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
          extracted_text?: string | null;
          extracted_at?: string | null;
          embedding?: string | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          is_favorite?: boolean;
          content_fingerprint?: string | null;
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
      collections: {
        Row: { id: string; user_id: string; name: string; description: string; color: string; created_at: string; updated_at: string };
        Insert: { id?: string; user_id?: string; name: string; description?: string; color?: string; created_at?: string; updated_at?: string };
        Update: { name?: string; description?: string; color?: string; updated_at?: string };
        Relationships: [];
      };
      collection_memories: {
        Row: { collection_id: string; memory_id: string; user_id: string; created_at: string };
        Insert: { collection_id: string; memory_id: string; user_id?: string; created_at?: string };
        Update: Record<string, never>;
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
      claim_processing_jobs: {
        Args: { batch_limit?: number; target_memory_id?: string | null; target_user_id?: string | null };
        Returns: Database["public"]["Tables"]["processing_jobs"]["Row"][];
      };
      complete_processing_job: {
        Args: { target_job_id: string; result_text: string; result_summary: string; result_tags: string[]; result_metadata?: Json };
        Returns: undefined;
      };
      fail_processing_job: {
        Args: { target_job_id: string; failure_message: string; terminal?: boolean };
        Returns: undefined;
      };
      recover_stale_processing_jobs: {
        Args: Record<string, never>;
        Returns: number;
      };
      store_memory_embedding: {
        Args: { target_memory_id: string; target_user_id: string; embedding_input: string; embedding_model_name: string };
        Returns: undefined;
      };
      complete_embedding_job: {
        Args: { target_job_id: string; embedding_input: string; embedding_model_name: string };
        Returns: undefined;
      };
      hybrid_search_memories: {
        Args: { target_user_id: string; query_text: string; query_embedding_text?: string | null; match_count?: number; kind_filter?: string | null };
        Returns: Array<{
          id: string;
          title: string;
          content: string;
          kind: string;
          source_url: string | null;
          summary: string | null;
          extracted_text: string | null;
          processing_status: string;
          storage_path: string | null;
          original_filename: string | null;
          mime_type: string | null;
          file_size: number | null;
          extracted_at: string | null;
          created_at: string;
          search_score: number;
          keyword_rank: number | null;
          semantic_rank: number | null;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
