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
          graph_analyzed_at: string | null;
          study_analyzed_at: string | null;
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
          graph_analyzed_at?: string | null;
          study_analyzed_at?: string | null;
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
          graph_analyzed_at?: string | null;
          study_analyzed_at?: string | null;
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
      entities: {
        Row: { id: string; user_id: string; display_name: string; normalized_name: string; entity_type: string; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; display_name: string; normalized_name: string; entity_type: string; created_at?: string; updated_at?: string };
        Update: { display_name?: string; normalized_name?: string; entity_type?: string; updated_at?: string };
        Relationships: [];
      };
      memory_entities: {
        Row: { memory_id: string; entity_id: string; user_id: string; confidence: number; evidence: string; created_at: string };
        Insert: { memory_id: string; entity_id: string; user_id: string; confidence?: number; evidence?: string; created_at?: string };
        Update: { confidence?: number; evidence?: string };
        Relationships: [];
      };
      entity_relationships: {
        Row: { id: string; user_id: string; memory_id: string; source_entity_id: string; target_entity_id: string; relationship_type: string; confidence: number; evidence: string; created_at: string };
        Insert: { id?: string; user_id: string; memory_id: string; source_entity_id: string; target_entity_id: string; relationship_type: string; confidence?: number; evidence?: string; created_at?: string };
        Update: { relationship_type?: string; confidence?: number; evidence?: string };
        Relationships: [];
      };
      action_items: {
        Row: { id: string; user_id: string; memory_id: string; title: string; normalized_title: string; description: string; item_type: string; status: string; due_at: string | null; confidence: number; evidence: string; completed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; memory_id: string; title: string; normalized_title: string; description?: string; item_type?: string; status?: string; due_at?: string | null; confidence?: number; evidence?: string; completed_at?: string | null; created_at?: string; updated_at?: string };
        Update: { title?: string; normalized_title?: string; description?: string; item_type?: string; status?: string; due_at?: string | null; confidence?: number; evidence?: string; completed_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      study_cards: {
        Row: { id: string; user_id: string; memory_id: string; question: string; normalized_question: string; answer: string; distractors: string[]; confidence: number; evidence: string; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; memory_id: string; question: string; normalized_question: string; answer: string; distractors?: string[]; confidence?: number; evidence?: string; created_at?: string; updated_at?: string };
        Update: { question?: string; normalized_question?: string; answer?: string; distractors?: string[]; confidence?: number; evidence?: string; updated_at?: string };
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
      request_memory_reanalysis: {
        Args: { target_memory_ids: string[] };
        Returns: string[];
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
      replace_memory_graph: {
        Args: { target_job_id: string; result_entities?: Json; result_relationships?: Json };
        Returns: undefined;
      };
      replace_memory_action_items: {
        Args: { target_job_id: string; result_action_items?: Json };
        Returns: undefined;
      };
      request_study_reanalysis: {
        Args: { target_memory_ids: string[] };
        Returns: string[];
      };
      replace_memory_study_cards: {
        Args: { target_job_id: string; result_study_cards?: Json };
        Returns: undefined;
      };
      update_action_item_status: {
        Args: { target_action_item_id: string; next_status: string };
        Returns: Database["public"]["Tables"]["action_items"]["Row"];
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
