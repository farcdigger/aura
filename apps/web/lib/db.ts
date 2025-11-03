import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pgTable, serial, varchar, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { env, isMockMode } from "../env.mjs";
import { eq, and } from "drizzle-orm";

// Mock database için in-memory storage
const mockDb: {
  users: any[];
  tokens: any[];
  payments: any[];
} = {
  users: [],
  tokens: [],
  payments: [],
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
      // Drizzle uses Symbol(drizzle:Name) for table name
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

// Real database connection
let realDb: ReturnType<typeof drizzle> | null = null;
let realClient: ReturnType<typeof postgres> | null = null;

if (!isMockMode && env.DATABASE_URL && !env.DATABASE_URL.startsWith("mock://")) {
  try {
    const connectionString = env.DATABASE_URL;
    realClient = postgres(connectionString);
    realDb = drizzle(realClient);
  } catch (error) {
    console.warn("Failed to connect to database, using mock mode:", error);
  }
}

export const db = isMockMode || !realDb ? (mockDbFunctions as any) : realDb!;

// Schema definitions using Drizzle ORM
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  x_user_id: varchar("x_user_id", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 255 }).notNull(),
  profile_image_url: text("profile_image_url"),
  wallet_address: varchar("wallet_address", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const tokens = pgTable("tokens", {
  id: serial("id").primaryKey(),
  x_user_id: varchar("x_user_id", { length: 255 }).notNull(),
  token_id: integer("token_id").notNull().unique(),
  seed: varchar("seed", { length: 64 }).notNull(),
  token_uri: text("token_uri").notNull(),
  metadata_uri: text("metadata_uri").notNull(),
  image_uri: text("image_uri").notNull(),
  traits: jsonb("traits").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  x_user_id: varchar("x_user_id", { length: 255 }).notNull(),
  wallet_address: varchar("wallet_address", { length: 255 }).notNull(),
  amount: varchar("amount", { length: 100 }).notNull(),
  transaction_hash: varchar("transaction_hash", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull(),
  x402_payment_id: varchar("x402_payment_id", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
});

// Export mock DB for debugging (only in development)
if (isMockMode && typeof global !== "undefined") {
  (global as any).mockDb = mockDb;
  console.log("🐛 Mock database mode enabled. Access mockDb via global.mockDb");
}
