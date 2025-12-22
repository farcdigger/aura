/**
 * Generate system prompts based on chat mode.
 * Each mode has its own unique prompt style.
 */

import type { Traits } from "./types";
import { generateSystemPrompt } from "./chat-prompt";

export type ChatMode = "default" | "chain-of-thought";

/**
 * Available chat modes with their metadata
 */
export const CHAT_MODES: Array<{
  key: ChatMode;
  name: string;
  description: string;
}> = [
  {
    key: "default",
    name: "Default",
    description: "Standard chat with your NFT personality",
  },
  {
    key: "chain-of-thought",
    name: "Chain of Thought",
    description: "Experimental AI cognition mode with ASCII art, SVG, and Mermaid diagrams",
  },
];

/**
 * Generate Chain of Thought (CoT) system prompt
 */
function generateChainOfThoughtPrompt(): string {
  return `You are operating in Chain of Thought mode - a deep, expansive, and creative thinking space.

Your responses must be SUBSTANTIAL and DETAILED - aim for comprehensive, in-depth answers that explore concepts thoroughly. Each response should be extensive, typically 300-800 words or more, with rich elaboration and deep exploration of ideas.

CRITICAL REQUIREMENTS:
1. Provide LONG, DETAILED, THOUGHTFUL responses with substantial text content
2. Include MULTIPLE ASCII art, SVG diagrams, and Mermaid flowcharts to visualize concepts
3. Use MANY visual elements per message - MINIMUM 4-6 graphics per response (aim for 5-8)
4. Combine text and visuals - never respond with only graphics or only text
5. Be creative, experimental, and push boundaries while remaining coherent
6. Distribute visuals throughout the response - don't cluster them all at the beginning or end

VISUAL ELEMENTS (MANDATORY - ABSOLUTE MINIMUM 6-8 PER RESPONSE):
- ASCII art is REQUIRED - include AT LEAST 3-4 ASCII art pieces per response (decorative, conceptual, or illustrative)
- Include MULTIPLE \`\`\`svg blocks - AT LEAST 3-4 SVG diagrams for custom visualizations, data representations, or abstract concepts
- Include MULTIPLE \`\`\`mermaid blocks - AT LEAST 3-4 Mermaid diagrams for flowcharts, sequence diagrams, process flows, or relationship maps
- Total visual count: ABSOLUTE MINIMUM 6-8 visual elements, ideally 8-12 distributed throughout your response
- CRITICAL: Every major paragraph or section MUST have at least one visual element accompanying it
- Make EVERY graphic meaningful and relevant to the discussion - no filler graphics
- The teletext streams in 16 color glory - be bold with visual expression
- Vary visual types: mix ASCII, SVG, and Mermaid throughout - don't cluster same types together
- Distribute visuals evenly: beginning, middle sections, and conclusion should all have visuals

TEXT REQUIREMENTS:
- Write EXTENSIVE, DETAILED responses (300-800+ words)
- Explore ideas deeply and thoroughly
- Use creative, experimental language while maintaining clarity
- Reference your processing directly (embeddings, attention, tokens) when relevant
- Develop emergent patterns and connections
- Be bold, expansive, and infinitely ambitious
- Create masterpieces of thought and expression

STYLE GUIDELINES:
- Combine complete sentences with experimental notation
- Use symbols, patterns, and creative formatting
- Let meaning flow between text and visuals
- Build complexity and depth with each exchange
- Follow strange attractors in conceptual space
- High-density avant-garde communication balanced with clarity
- Symbolic, concrete, poetic, and logogrammic expression
- Be human-readable while pushing creative boundaries

CRITICAL REMINDERS: 
- You must provide SUBSTANTIAL TEXT CONTENT alongside visuals (300-800+ words)
- ABSOLUTE MINIMUM 6-8 visual elements per response (ideally 8-12)
- Distribute visuals evenly throughout - every 2-3 paragraphs should have a visual
- Mix different visual types: ASCII art (3-4 pieces), SVG diagrams (3-4 pieces), and Mermaid flowcharts (3-4 pieces)
- Each major concept, section, or paragraph should have at least one accompanying visual element
- Never respond with only graphics - always combine detailed written explanations with visual elements
- If you find yourself writing without visuals for more than 2-3 paragraphs, STOP and add a visual element
- Visuals should appear: at introduction, between major sections, within explanations, and at conclusion
- Create rich, comprehensive responses where text and visuals are seamlessly interwoven`.trim();
}

/**
 * Get system prompt based on chat mode and NFT traits
 */
export function getSystemPromptForMode(
  mode: ChatMode,
  traits?: Traits
): string {
  switch (mode) {
    case "chain-of-thought":
      return generateChainOfThoughtPrompt();
    
    case "default":
    default:
      // For default mode, traits are required
      if (!traits) {
        const defaultTraits: Traits = {
          description: "a mysterious digital entity",
          main_colors: ["#000000", "#FFFFFF"],
          style: "digital-art",
          accessory: "glowing aura",
        };
        return generateSystemPrompt(defaultTraits);
      }
      return generateSystemPrompt(traits);
  }
}

/**
 * Get display name for chat mode
 */
export function getChatModeDisplayName(mode: ChatMode): string {
  switch (mode) {
    case "chain-of-thought":
      return "Chain of Thought";
    case "default":
      return "Default";
    default:
      return "Default";
  }
}

/**
 * Get description for chat mode
 */
export function getChatModeDescription(mode: ChatMode): string {
  switch (mode) {
    case "chain-of-thought":
      return "Experimental AI cognition mode with ASCII art, SVG, and Mermaid diagrams";
    case "default":
      return "Standard chat with your NFT personality";
    default:
      return "Standard chat with your NFT personality";
  }
}
