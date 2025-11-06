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
    console.log(`   URL: ${env.NEXT_PUBLIC_SUPABASE_URL}`);
    console.log(`   Service Role Key: ${env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10)}...`);
  } catch (error: any) {
    console.error("❌ Failed to initialize Supabase client:", error);
  }
} else {
  console.warn("⚠️ Supabase credentials not configured - using mock mode");
  console.warn(`   NEXT_PUBLIC_SUPABASE_URL: ${env.NEXT_PUBLIC_SUPABASE_URL ? "✅ Set" : "❌ Missing"}`);
  console.warn(`   SUPABASE_SERVICE_ROLE_KEY: ${env.SUPABASE_SERVICE_ROLE_KEY ? "✅ Set" : "❌ Missing"}`);
  console.warn("   💡 Add these environment variables in Vercel:");
  console.warn("      - NEXT_PUBLIC_SUPABASE_URL");
  console.warn("      - SUPABASE_SERVICE_ROLE_KEY");
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
              // Cast to any to bypass TypeScript's strict type checking for dynamic table names
              const client = supabaseClient as any;
              let query = client.from(tableName).select("*");
              
              // Parse Drizzle eq() condition - try multiple ways to extract column name and value
              if (condition) {
                let columnName: string | undefined;
                let value: any;
                
                // Method 1: Try queryChunks format (newer Drizzle format)
                if (condition.queryChunks && Array.isArray(condition.queryChunks)) {
                  // Parse queryChunks: [..., { name: "column_name" }, ..., "value", ...]
                  for (let i = 0; i < condition.queryChunks.length; i++) {
                    const chunk = condition.queryChunks[i];
                    // Look for object with name property (column name)
                    if (typeof chunk === 'object' && chunk !== null && chunk.name) {
                      columnName = chunk.name;
                    }
                    // Look for string value (after column name)
                    if (columnName && typeof chunk === 'string' && chunk.length > 0 && !chunk.includes('=') && !chunk.includes(' ')) {
                      value = chunk;
                      break;
                    }
                  }
                  // Also try direct string value in queryChunks
                  if (columnName && !value) {
                    for (const chunk of condition.queryChunks) {
                      if (typeof chunk === 'string' && chunk.length > 0 && chunk !== ' = ' && !chunk.match(/^[\s=]*$/)) {
                        value = chunk;
                        break;
                      }
                    }
                  }
                }
                
                // Method 2: Direct _column access
                if (!columnName && condition._column) {
                  columnName = condition._column.name || 
                               condition._column._?.name || 
                               condition._column._?.column?.name ||
                               condition._column.column?.name;
                  
                  // Try to get value from _value
                  if (condition._value !== undefined) {
                    value = condition._value.value !== undefined ? condition._value.value : condition._value;
                  }
                }
                
                // Method 3: Try column property
                if (!columnName && condition.column) {
                  columnName = condition.column.name || condition.column._?.name;
                  value = condition.value;
                }
                
                // Method 4: Try to extract from Drizzle's internal structure
                if (!columnName && typeof condition === 'object') {
                  // Drizzle might store column name in different places
                  const keys = Object.keys(condition);
                  for (const key of keys) {
                    if (key.includes('column') || key.includes('name')) {
                      const colObj = (condition as any)[key];
                      if (colObj && (colObj.name || colObj._?.name)) {
                        columnName = colObj.name || colObj._?.name;
                        break;
                      }
                    }
                  }
                  
                  // Try to find value
                  if (!value) {
                    if (condition._value !== undefined) {
                      value = condition._value.value ?? condition._value;
                    } else if ((condition as any).value !== undefined) {
                      value = (condition as any).value;
                    }
                  }
                }
                
                // Apply filter if we found both column name and value
                if (columnName && value !== undefined) {
                  console.log(`🔍 Applying filter: ${columnName} = ${value}`);
                  query = query.eq(columnName, value);
                } else {
                  console.error(`❌ CRITICAL: Could not parse condition for ${tableName}!`, {
                    conditionKeys: Object.keys(condition),
                    condition: JSON.stringify(condition, null, 2).substring(0, 500),
                    columnName,
                    value,
                  });
                  // SAFETY: If we can't parse the condition, return empty array to prevent false positives
                  // This is safer than returning all records which could cause duplicate detection bugs
                  console.warn(`⚠️ Returning empty array due to condition parsing failure (preventing false positives)`);
                  return [];
                }
              }

              const { data, error } = await query.limit(n);
              
              if (error) {
                console.error(`Supabase select error from ${tableName}:`, error);
                return [];
              }
              
              console.log(`📊 Query result from ${tableName}: ${data?.length || 0} rows`);

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
            // Cast to any to bypass TypeScript's strict type checking for dynamic table names
            const client = supabaseClient as any;
            const { data, error } = await client
              .from(tableName)
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
          // Cast to any to bypass TypeScript's strict type checking for dynamic table names
          const client = supabaseClient as any;
          const { data, error } = await client
            .from(tableName)
            .insert(values)
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
              // Cast to any to bypass TypeScript's strict type checking for dynamic table names
              const client = supabaseClient as any;
              let query = client.from(tableName).update(values);

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

// Drizzle table objects with column definitions (for eq() conditions to work)
// These objects need to have column properties that Drizzle can use
export const tokens = {
  name: tokensTable,
  // Column definitions for Drizzle eq() conditions
  x_user_id: { name: "x_user_id" },
  token_id: { name: "token_id" },
  seed: { name: "seed" },
  id: { name: "id" },
  status: { name: "status" },
  tx_hash: { name: "tx_hash" },
  image_id: { name: "image_id" },
} as any;

export const users = {
  name: usersTable,
  x_user_id: { name: "x_user_id" },
  id: { name: "id" },
} as any;

export const payments = {
  name: paymentsTable,
  x_user_id: { name: "x_user_id" },
  id: { name: "id" },
} as any;

// Export Supabase client for direct access if needed
export { supabaseClient };

// Export helper to check if Supabase is configured
export const isSupabaseAvailable = supabaseClient !== null;

