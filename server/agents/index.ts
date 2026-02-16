/**
 * Agent System Exports
 * Central export point for all agent modules
 */

// Core orchestration
export { executeAgent, fillTemplate } from "./agentRunner";
export type { AgentType, ExecuteAgentParams, ExecuteAgentResult } from "./agentRunner";

// Agent 1: Document Intelligence
export { extractDocument } from "./documentIntelligence";
export type {
  ExtractDocumentParams,
  ExtractionResult,
} from "./documentIntelligence";

// Agent 2: Processor
export { analyzeDeals } from "./processorAgent";
export type { AnalyzeDealsParams } from "./processorAgent";

// Agent 3: Communication
export { draftCommunications } from "./communicationAgent";
export type { DraftCommunicationsParams } from "./communicationAgent";

// Deal Story
export { updateDealStory } from "./dealStory";
export type { UpdateDealStoryParams } from "./dealStory";
