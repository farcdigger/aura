// Use Supabase REST API instead of direct PostgreSQL connection
// This is more reliable on Vercel and doesn't require DATABASE_URL
import { db as supabaseDb, tokens, users, payments, chat_tokens as supabaseChatTokens, getTableName, posts as supabasePosts, post_favs as supabasePostFavs, weekly_rewards as supabaseWeeklyRewards } from "./db-supabase";
import { env } from "../env.mjs";
import { eq } from "drizzle-orm";

// Check if Supabase is configured
export const isSupabaseConfigured = !!(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

// Mock database için in-memory storage (fallback)
const mockDb: {
  users: any[];
  tokens: any[];
  payments: any[];
  chat_tokens: any[];
  posts: any[];
  post_favs: any[];
  weekly_rewards: any[];
} = {
  users: [],
  tokens: [],
  payments: [],
  chat_tokens: [],
  posts: [],
  post_favs: [],
  weekly_rewards: [],
};

// Helper function to evaluate where conditions
function matchesWhere(record: any, condition: any): boolean {
  if (!condition) return true;
  
  // Handle eq() conditions - Drizzle ORM's eq() returns a complex object
  if (condition._op === "eq" || condition.op === "eq" || condition?.op === "eq") {
    // Try multiple ways to extract column name from Drizzle column object
    let columnName: string | undefined;
    
    // Method 1: Direct access
    if (condition._column) {
      columnName = condition._column.name || 
                   condition._column.column?.name || 
                   condition._column._?.name ||
                   condition._column._?.column?.name;
    }
    
    // Method 2: Alternative property names
    if (!columnName && condition.column) {
      columnName = condition.column.name || 
                   condition.column.column?.name || 
                   condition.column._?.name;
    }
    
    // Method 3: Try to get from column object directly
    if (!columnName && condition._column && typeof condition._column === 'object') {
      // Try to find 'name' property recursively
      const findName = (obj: any): string | undefined => {
        if (obj?.name) return obj.name;
        if (obj?._?.name) return obj._.name;
        if (obj?.column?.name) return obj.column.name;
        return undefined;
      };
      columnName = findName(condition._column);
    }
    
    // Try different ways to get value
    let value: any;
    if (condition._value !== undefined) {
      value = condition._value.value !== undefined ? condition._value.value : condition._value;
    } else if (condition.value !== undefined) {
      value = condition.value;
    }
    
    if (columnName && value !== undefined) {
      return record[columnName] === value;
    }
    
    // Debug: Log the condition structure to understand it better
    if (!columnName || value === undefined) {
      console.warn("Mock DB: Could not parse eq() condition:", {
        condition: JSON.stringify(condition, null, 2),
        columnName,
        value,
      });
    }
    
    // Fallback: return true to avoid filtering out records incorrectly
    return true;
  }
  
  // Handle and() conditions
  if (condition._op === "and" || condition.op === "and") {
    const conditions = condition._conditions || condition.conditions || [];
    return conditions.every((c: any) => matchesWhere(record, c));
  }
  
  return true;
}

// Mock database functions that match Drizzle ORM API
const mockDbFunctions = {
  select: () => ({
    from: (table: any) => {
      // Extract table name from Drizzle table object
      let tableName: string = "tokens"; // Default fallback
      
      if (typeof table === "string") {
        tableName = table;
      } else if (table) {
        // Try Symbol(drizzle:Name) first (most reliable)
        const drizzleNameSymbol = Symbol.for("drizzle:Name");
        if (table[drizzleNameSymbol]) {
          tableName = table[drizzleNameSymbol];
        } else if (table._?.name) {
          tableName = table._.name;
        } else if (table.name) {
          tableName = table.name;
        } else if (table.tableName) {
          tableName = table.tableName;
        } else {
          // Last resort: try to find any name property
          console.warn("Could not determine table name from:", Object.keys(table));
        }
      }
      
      const data = mockDb[tableName as keyof typeof mockDb] || [];
      
      return {
        where: (condition: any) => ({
          limit: async (n: number) => {
            try {
              const filtered = data.filter((record: any) => matchesWhere(record, condition));
              return filtered.slice(0, n);
            } catch (error) {
              console.error("Error in where clause:", error, "condition:", condition);
              // Return empty array on error instead of crashing
              return [];
            }
          },
        }),
        limit: async (n: number) => {
          return data.slice(0, n);
        },
      };
    },
  }),
  insert: (table: any) => ({
    values: async (values: any) => {
      // Extract table name from Drizzle table object
      let tableName: string = "tokens"; // Default fallback
      
      if (typeof table === "string") {
        tableName = table;
      } else if (table) {
        // Try to find Symbol(drizzle:Name) - Drizzle uses this for table name
        const symbols = Object.getOwnPropertySymbols(table);
        let foundTableName = false;
        
        for (const sym of symbols) {
          const symDesc = sym.toString();
          if (symDesc.includes("drizzle:Name") || symDesc.includes("drizzle:OriginalName")) {
            const nameValue = table[sym];
            if (typeof nameValue === "string") {
              tableName = nameValue;
              foundTableName = true;
              break;
            }
          }
        }
        
        // Fallback methods if symbol not found
        if (!foundTableName) {
          if (table._?.name) {
            tableName = table._.name;
          } else if (table.name) {
            tableName = table.name;
          } else if (table.tableName) {
            tableName = table.tableName;
          } else {
            // Last resort
            console.warn("Could not determine table name from:", Object.keys(table));
          }
        }
      }
      
      const id = (mockDb[tableName as keyof typeof mockDb]?.length || 0) + 1;
      const newRecord = { 
        id, 
        ...values, 
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDb[tableName as keyof typeof mockDb]?.push(newRecord);
      return [newRecord];
    },
  }),
  update: (table: any) => ({
    set: (values: any) => ({
      where: async (condition: any) => {
        // Extract table name from Drizzle table object
        let tableName: string = "tokens"; // Default fallback
        
        if (typeof table === "string") {
          tableName = table;
        } else if (table) {
          const drizzleNameSymbol = Symbol.for("drizzle:Name");
          if (table[drizzleNameSymbol]) {
            tableName = table[drizzleNameSymbol];
          } else if (table._?.name) {
            tableName = table._.name;
          } else if (table.name) {
            tableName = table.name;
          } else if (table.tableName) {
            tableName = table.tableName;
          } else {
            console.warn("Could not determine table name from:", Object.keys(table));
          }
        }
        
        const data = mockDb[tableName as keyof typeof mockDb] || [];
        const updated = data.filter((record: any) => matchesWhere(record, condition));
        updated.forEach((record: any) => {
          Object.assign(record, values, { updated_at: new Date() });
        });
        return updated;
      },
    }),
  }),
};

// Use Supabase REST API if configured, otherwise fall back to mock
export const db = isSupabaseConfigured ? supabaseDb : (mockDbFunctions as any);

// Export table objects (for backward compatibility)
export { tokens, users, payments };

// Export chat_tokens table object
// Use Supabase version if configured, otherwise use mock version
export const chat_tokens = isSupabaseConfigured ? supabaseChatTokens : {
  name: "chat_tokens",
  wallet_address: { name: "wallet_address" },
  balance: { name: "balance" },
  points: { name: "points" },
  total_tokens_spent: { name: "total_tokens_spent" },
  id: { name: "id" },
} as any;

// Export new table objects
// Note: supabasePosts, supabasePostFavs, supabaseWeeklyRewards are already imported at the top

export const posts = isSupabaseConfigured ? supabasePosts : {
  name: "posts",
  id: { name: "id" },
  wallet_address: { name: "wallet_address" },
  nft_token_id: { name: "nft_token_id" },
  content: { name: "content" },
  fav_count: { name: "fav_count" },
  points_earned: { name: "points_earned" },
  tokens_burned: { name: "tokens_burned" },
  created_at: { name: "created_at" },
} as any;

export const post_favs = isSupabaseConfigured ? supabasePostFavs : {
  name: "post_favs",
  id: { name: "id" },
  post_id: { name: "post_id" },
  wallet_address: { name: "wallet_address" },
  nft_token_id: { name: "nft_token_id" },
  tokens_burned: { name: "tokens_burned" },
  created_at: { name: "created_at" },
} as any;

export const weekly_rewards = isSupabaseConfigured ? supabaseWeeklyRewards : {
  name: "weekly_rewards",
  id: { name: "id" },
  week_start_date: { name: "week_start_date" },
  week_end_date: { name: "week_end_date" },
  reward_type: { name: "reward_type" },
  winner_wallet_address: { name: "winner_wallet_address" },
  winner_nft_token_id: { name: "winner_nft_token_id" },
  winner_post_id: { name: "winner_post_id" },
  tokens_awarded: { name: "tokens_awarded" },
  status: { name: "status" },
  created_at: { name: "created_at" },
} as any;

// Export mock DB for debugging (only in development)
if (!isSupabaseConfigured && typeof global !== "undefined") {
  (global as any).mockDb = mockDb;
  console.log("🐛 Mock database mode enabled. Access mockDb via global.mockDb");
}
