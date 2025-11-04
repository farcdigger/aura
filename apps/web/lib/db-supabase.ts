import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.mjs";

// Database schema type (for type safety)
type Database = {
  public: {
    Tables: {
      tokens: {
        Row: {
          id: number;
          x_user_id: string;
          token_id: number;
          seed: string;
          token_uri: string;
          metadata_uri: string;
          image_uri: string;
          traits: any;
          created_at: string | null;
        };
        Insert: {
          id?: number;
          x_user_id: string;
          token_id?: number;
          seed: string;
          token_uri: string;
          metadata_uri: string;
          image_uri: string;
          traits: any;
          created_at?: string | null;
        };
        Update: {
          id?: number;
          x_user_id?: string;
          token_id?: number;
          seed?: string;
          token_uri?: string;
          metadata_uri?: string;
          image_uri?: string;
          traits?: any;
          created_at?: string | null;
        };
      };
      users: {
        Row: {
          id: number;
          x_user_id: string;
          username: string;
          profile_image_url: string | null;
          wallet_address: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          x_user_id: string;
          username: string;
          profile_image_url?: string | null;
          wallet_address?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          x_user_id?: string;
          username?: string;
          profile_image_url?: string | null;
          wallet_address?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      payments: {
        Row: {
          id: number;
          x_user_id: string;
          wallet_address: string;
          amount: string;
          transaction_hash: string | null;
          status: string;
          x402_payment_id: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: number;
          x_user_id: string;
          wallet_address: string;
          amount: string;
          transaction_hash?: string | null;
          status: string;
          x402_payment_id?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: number;
          x_user_id?: string;
          wallet_address?: string;
          amount?: string;
          transaction_hash?: string | null;
          status?: string;
          x402_payment_id?: string | null;
          created_at?: string | null;
        };
      };
    };
  };
};

// Supabase client using REST API (no PostgreSQL connection string needed)
// This is more reliable on Vercel and doesn't require DATABASE_URL
let supabaseClient: SupabaseClient<Database> | null = null;

if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseClient = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    console.log("✅ Supabase client initialized (using REST API)");
  } catch (error: any) {
    console.error("❌ Failed to initialize Supabase client:", error);
  }
} else {
  console.warn("⚠️ Supabase credentials not configured - using mock mode");
}

// Helper function to get table name from Drizzle table object
function extractTableName(table: any): string {
  if (typeof table === "string") {
    return table;
  }
  
  // Try to extract table name from Drizzle table object
  const drizzleNameSymbol = Symbol.for("drizzle:Name");
  if (table[drizzleNameSymbol]) {
    return table[drizzleNameSymbol];
  }
  
  if (table._?.name) {
    return table._.name;
  }
  
  if (table.name) {
    return table.name;
  }

  // Fallback to known table names
  if (table === tokens) return tokensTable;
  if (table === users) return usersTable;
  if (table === payments) return paymentsTable;

  return "tokens"; // Default fallback
}

// Database operations using Supabase REST API
export const db = {
  // Select operation
  select: () => ({
    from: (table: any) => {
      const tableName = extractTableName(table);
      
      return {
        where: (condition: any) => ({
          limit: async (n: number) => {
            if (!supabaseClient) {
              console.warn("⚠️ Supabase client not available, returning empty array");
              return [];
            }

            try {
              // Type assertion needed because tableName is dynamic
              let query = supabaseClient.from(tableName as any).select("*");
              
              if (condition && condition._column) {
                const columnName = condition._column.name || condition._column._?.name;
                const value = condition._value?.value ?? condition._value;
                
                if (columnName && value !== undefined) {
                  query = query.eq(columnName, value);
                }
              }

              const { data, error } = await query.limit(n);
              
              if (error) {
                console.error(`Supabase select error from ${tableName}:`, error);
                return [];
              }

              return data || [];
            } catch (error: any) {
              console.error(`Supabase select error from ${tableName}:`, error);
              return [];
            }
          },
        }),
        limit: async (n: number) => {
          if (!supabaseClient) {
            console.warn("⚠️ Supabase client not available, returning empty array");
            return [];
          }

          try {
            // Type assertion needed because tableName is dynamic
            const { data, error } = await supabaseClient
              .from(tableName as any)
              .select("*")
              .limit(n);

            if (error) {
              console.error(`Supabase select error from ${tableName}:`, error);
              return [];
            }

            return data || [];
          } catch (error: any) {
            console.error(`Supabase select error from ${tableName}:`, error);
            return [];
          }
        },
      };
    },
  }),

  // Insert operation
  insert: (table: any) => {
    const tableName = extractTableName(table);
    
    return {
      values: async (values: any) => {
        if (!supabaseClient) {
          throw new Error("Supabase client not available");
        }

        try {
          // Type assertion needed because tableName is dynamic
          const { data, error } = await supabaseClient
            .from(tableName as any)
            .insert(values as any)
            .select()
            .single();

          if (error) {
            console.error(`Supabase insert error into ${tableName}:`, error);
            throw error;
          }

          return [data];
        } catch (error: any) {
          console.error(`Supabase insert error into ${tableName}:`, error);
          throw error;
        }
      },
    };
  },

  // Update operation
  update: (table: any) => {
    const tableName = extractTableName(table);
    
    return {
      set: (values: any) => ({
        where: (condition: any) => ({
          execute: async () => {
            if (!supabaseClient) {
              throw new Error("Supabase client not available");
            }

            try {
              // Type assertion needed because tableName is dynamic
              let query = supabaseClient.from(tableName as any).update(values as any);

              // Parse Drizzle eq() condition
              if (condition && condition._column) {
                const columnName = condition._column.name || condition._column._?.name;
                const value = condition._value?.value ?? condition._value;
                
                if (columnName && value !== undefined) {
                  query = query.eq(columnName, value);
                }
              }

              const { data, error } = await query.select();

              if (error) {
                console.error(`Supabase update error in ${tableName}:`, error);
                throw error;
              }

              return data || [];
            } catch (error: any) {
              console.error(`Supabase update error in ${tableName}:`, error);
              throw error;
            }
          },
        }),
      }),
    };
  },

  // Execute SQL (for migrations)
  execute: async (sql: any) => {
    // Supabase REST API doesn't support raw SQL
    // This is only used for migrations, which should be run via Supabase dashboard
    console.warn("⚠️ execute() called - Supabase REST API doesn't support raw SQL");
    console.warn("💡 Run migrations via Supabase Dashboard or use Supabase CLI");
    return { rows: [] };
  },
};

// Table names (for Supabase REST API)
export const tokensTable = "tokens";
export const usersTable = "users";
export const paymentsTable = "payments";

// Export helper function (for backward compatibility)
export function getTableName(table: any): string {
  return extractTableName(table);
}

// Drizzle table objects (for backward compatibility with existing code)
export const tokens = { name: tokensTable } as any;
export const users = { name: usersTable } as any;
export const payments = { name: paymentsTable } as any;

// Export Supabase client for direct access if needed
export { supabaseClient };

