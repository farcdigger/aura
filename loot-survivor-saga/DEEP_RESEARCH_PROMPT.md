# Deep Research Prompt: ls009GameEventModels Event Storage Analysis

## 🎯 Research Objective
Understand why `ls009GameEventModels` Torii GraphQL query returns only 1 event for a game with `action_count: 506`, and identify alternative solutions for fetching comprehensive game event data for comic book generation.

---

## 📊 Current Situation & What We've Achieved

### ✅ SUCCESSFULLY IMPLEMENTED

1. **ls009GameEventModels Query Works**
   - Query executes successfully without timeout
   - O(1) access - much faster than `events` query
   - Returns data structure: `{ adventurer_id, action_count, details: { flee, option, attack, discovery, ... } }`
   - Pagination works correctly (`hasNextPage`, `endCursor`)

2. **Event Parsing Works**
   - Successfully parses event details to `GameLog` format
   - Handles different event types (Attack, Discovery, Ambush, BeastAttack, Flee)
   - No syntax errors, code compiles and runs

3. **Adventurer State Data Works**
   - `ls009AdventurerPackedModels` query works perfectly
   - Successfully decodes packed data (health, xp, level, gold, stats, equipment)
   - Action count retrieved: 506 (proving the game has 506 actions)

### ❌ CURRENT PROBLEM

**Issue**: `ls009GameEventModels` returns only **1 event** for a game with `action_count: 506`

**Evidence**:
- Game ID: 133595
- Adventurer ID: 0x209db
- Action Count: 506 (from packed data)
- Events Found: 1 (only a "flee" event with `flee: true, option: "adventurer"`)
- `hasNextPage: false` (pagination confirms only 1 event exists)

**Hypothesis**:
- `ls009GameEventModels` may NOT store all game events
- It might only store specific event types (e.g., only "flee" events)
- It might only store "significant" events (state changes, special events)
- There might be a relationship issue between `action_count` and stored events

---

## 🔍 Research Questions

### Primary Questions

1. **What events does ls009GameEventModels store?**
   - Does it store ALL game events or only SPECIFIC event types?
   - Which event types are stored? (Attack, Discovery, Ambush, Flee, etc.)
   - Is there a filter or selection criteria for which events get stored?

2. **Relationship between action_count and stored events**
   - Does `action_count: 506` mean there should be 506 events?
   - Or is `action_count` just a counter that doesn't directly map to stored events?
   - What is the actual relationship between actions and events in the Dojo/Starknet architecture?

3. **How does ls009GameEventModels differ from the events query?**
   - `events` query (generic) - times out, but might have more data
   - `ls009GameEventModels` (model-specific) - works fast, but only 1 event
   - What's the architectural difference? Why does one have more data than the other?

4. **Event storage architecture in Torii/Dojo**
   - How does Torii index and store game events?
   - Are events stored in multiple places (generic events table vs. model-specific tables)?
   - Is there a data migration or sync process that might cause incomplete data?

### Secondary Questions

5. **Alternative data sources for game events**
   - Are there other GraphQL queries that might have more event data?
   - Can we query `eventMessages` or `eventMessage` instead?
   - Are there other model-specific queries (e.g., `ls009AttackEventModels`, `ls009DiscoveryEventModels`)?
   - Can we use the `entity` or `eventMessage` fields from `ls009GameEventModels` to get more data?

6. **Dojo/Starknet event emission patterns**
   - How does the Loot Survivor game emit events?
   - Are all actions emitted as events, or only specific ones?
   - Is there a pattern where only "significant" events are stored in models?

7. **Torii indexing and data availability**
   - Does Torii index all events or only model-specific events?
   - Is there a delay in indexing (could explain missing events)?
   - Are there any known limitations or filters in Torii's event storage?

---

## 🔧 Alternative Solutions to Explore

### Solution 1: Use Multiple Model Queries
- Query `ls009AttackEventModels` separately
- Query `ls009DiscoveryEventModels` separately
- Query `ls009AmbushEventModels` separately
- Combine results client-side

### Solution 2: Use eventMessages Query
- Try `eventMessages` or `eventMessage` GraphQL queries
- These might have more comprehensive event data
- Check if they support filtering by `adventurer_id`

### Solution 3: Use entity or eventMessage Fields
- `ls009GameEventModels` has `entity` and `eventMessage` fields
- These might contain additional event data or links to more events
- Explore if we can traverse these relationships

### Solution 4: Hybrid Approach
- Use `ls009GameEventModels` for fast, model-specific events
- Use `events` query with aggressive optimization for additional events
- Combine and deduplicate results

### Solution 5: Direct Blockchain Query
- Query Starknet blockchain directly (not via Torii)
- Use RPC calls to get event logs
- More complex but might have complete data

### Solution 6: Accept Limitation & Use Fallback
- Accept that `ls009GameEventModels` only stores significant events
- Use the 1 event we have + adventurer state data
- Generate comic book with fallback scenes based on state changes

---

## 📋 Research Deliverables

Please provide:

1. **Architecture Analysis**
   - How `ls009GameEventModels` stores events
   - What events are stored vs. what events exist
   - Relationship between `action_count` and stored events

2. **Alternative Query Analysis**
   - List all available GraphQL queries that might have event data
   - Test `eventMessages`, `eventMessage`, and other model queries
   - Compare data availability across different queries

3. **Recommended Solution**
   - Based on findings, recommend the best approach
   - Provide code examples or query structures
   - Explain trade-offs (speed vs. completeness)

4. **Fallback Strategy**
   - If complete event data is not available, what's the best fallback?
   - How can we generate a good comic book with limited event data?
   - What additional data sources can we use?

---

## 🎯 Success Criteria

A successful research should answer:
- ✅ Why only 1 event is returned for 506 actions
- ✅ What alternative queries/data sources are available
- ✅ Which solution provides the best balance of speed and completeness
- ✅ How to implement the recommended solution

---

## 📚 Context: Our Use Case

**Goal**: Generate comic books from past Loot Survivor game sessions

**Requirements**:
- Need detailed event data (attacks, discoveries, ambushes, etc.)
- Need chronological order of events
- Need event details (damage, locations, critical hits, etc.)
- Need to work reliably (no timeouts)

**Current Status**:
- ✅ Can get adventurer state (health, xp, level, stats, equipment)
- ✅ Can get 1 event (flee event) from `ls009GameEventModels`
- ❌ Cannot get comprehensive event history (missing 505+ events)
- ❌ `events` query times out (not usable)

**Next Steps After Research**:
- Implement recommended solution
- Test with multiple game IDs
- Generate comic books with complete event data

---

## 🔗 Resources to Check

### Primary Source Code Repository
- **Loot Survivor (Death Mountain) GitHub Repository**: https://github.com/Provable-Games/death-mountain.git
  - **Why Important**: This is the actual game source code. Examining the contracts will reveal:
    - How events are emitted (GameEvent structure)
    - What event types are stored in ls009GameEventModels
    - Relationship between action_count and actual events
    - Event data structure and format
    - Which events are stored vs. which are just logged
  - **Key Files to Examine**:
    - `contracts/` - Cairo/Dojo smart contracts
    - Look for GameEvent emission code
    - Look for model definitions (ls009GameEventModels)
    - Look for event handling and storage logic
    - Check how action_count is tracked vs. events stored

### Documentation & APIs
- Torii GraphQL API documentation
- Dojo framework event emission patterns
- Starknet event logging architecture
- Torii GitHub repository/issues
- Dojo documentation on models vs. events

---

**Please conduct thorough research and provide detailed findings with code examples and recommendations.**

