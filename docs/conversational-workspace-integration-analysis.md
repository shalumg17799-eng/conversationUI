# Conversational BI Workspace Integration Analysis

## 1. Existing Prompt Flow Mapping
The current analytical pipeline follows a rigid, top-down execution model:

1.  **Request Entry**: `index.ts` receives `/api/conversational/stream`.
2.  **Orchestration**: `runStreamingPipeline.ts` controls the flow.
3.  **Intent Layer**: `analyzeQuery` (in `llmHandler.ts`) decides whether to Clarify or Route to a table.
4.  **Data Layer**: `executeQuery` (in `queryEngine.ts`) performs a deterministic `SELECT *` from the routed table.
5.  **Design Layer**: `generateReport` (in `llmHandler.ts`) designs a NEW report layout from scratch.
6.  **Mutation Layer (Follow-ups)**: `classifyAndEditReport` (in `llmHandler.ts`) attempts to either modify the card tree (`edit_structural`) or restart the whole flow (`edit_data_change`).
7.  **Hydration**: `hydrateTree` attaches BigQuery data to the UI components.
8.  **Streaming**: Components are streamed individually to the frontend.

## 2. Existing State Management
### Backend (Stateless)
The backend does not persist session state. It relies entirely on the client payload:
- `priorContext`: A string summary of the last report (e.g., "Title: 'Sales Overview' Content: ...").
- `currentCards`: The JSON tree of the components currently rendered.
- `activeTable`: The BQ table associated with the current view.

### Frontend (Stateful)
- **Messages State**: `messages` array in `Conversational_new.tsx` stores the visual history.
- **Persistence**: `conversations` array in `Conversational_new.tsx` stores all sessions in local storage.
- **Rendering**: Every report generation creates a **NEW** message of type `generative_ui`. This is the root cause of "duplicate charts/tables" in the chat history.

## 3. Follow-Up Prompt Failure Points
- **The "Data Change" Trap**: In `runStreamingPipeline.ts` (line 264), any request classified as `edit_data_change` triggers a full call to `generateReport`. Since `generateReport` is designed for *new* reports, it often creates a completely different layout, losing previous context.
- **SQL Determinism vs User Intent**: Since `executeQuery` always runs `SELECT *` for the table, requests like "show top 5" are handled at the Design Layer (LLM picking top 5 from sample) rather than the Data Layer, leading to inconsistent visualizations when the full dataset is hydrated.
- **Narrative vs Analysis**: If a user asks "summarize this," the system still goes through the "Follow-up" logic which may try to edit the cards instead of just providing a chat response.

## 4. Safe Insertion Points
The most minimal and safe insertion points are:

### A. The "Conversational Interceptor"
Inside `runStreamingPipeline.ts`, BEFORE the existing follow-up logic.
- **Purpose**: Classify into `summarize`, `analyze`, `export` and handle them as "Narrative-only" or "Action-only" responses.
- **Safety**: Bypasses the analytical pipeline entirely for non-analytical queries.

### B. The "Transformation Router"
Replacing the `if (fusedResult.action === 'edit_structural')` and `edit_data_change` blocks.
- **Purpose**: Route to specialized transformers that mutate the `currentCards` object instead of calling `generateReport`.
- **Safety**: Preserves the `currentCards` structure as the baseline.

### C. The "Selective Hydrator"
Modifying `hydrateTree` to support "Partial Updates".
- **Purpose**: Only re-query or re-calculate data for specific cards that were modified.

## 5. Existing Services to Preserve
- ✅ **`queryEngine.ts`**: Keep as the source of truth for BQ connectivity.
- ✅ **`componentSelector.ts`**: Keep as the validator for allowed visualizations.
- ✅ **`catalogRefresher.ts`**: Keep as the grounding source for metadata.
- ✅ **`dataShapeAnalyzer.ts`**: Keep for understanding result sets.

**High Risk (DO NOT REFACTOR)**:
- The BigQuery client configuration and credentials.
- The base `UITreeNode` type definitions.

## 6. Frontend Update Strategy
Currently, the frontend appends a new message for every report update.
- **Proposed Evolution**: If the `InteractionType` is `modify`, `summarize`, or `analyze`, the frontend should update the **LAST** generative UI message instead of appending a new one.
- **Singleton Workspace**: Introduce an `activeReportId` to target updates to a specific report container.

## 7. Report Session Model
We will implement a `ReportSession` schema that encapsulates the workspace state:

```typescript
export interface ReportSession {
  sessionId: string;
  reportMetadata: {
    title: string;
    description: string;
    activeTable: string;
    domain: string;
  };
  workspace: {
    cards: ReportCard[];
    filters: Record<string, any>;
    sorting: { column: string; direction: 'asc'|'desc' }[];
  };
  narrative: {
    currentSummary: string;
    insightHistory: string[];
  };
}
```

## 8. Rollout Risk Analysis
| Phase | Risk Level | Potential Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| **1. Narrative Layer** | Low | None (New capability) | Use a dedicated prompt for "chat-only" answers. |
| **2. Transformation Engine** | Medium | Incorrect card mutations | Fallback to `new_report` if mutation fails validation. |
| **3. Session Persistence** | Medium | State mismatch | Always treat the current frontend `currentCards` as truth. |
| **4. Selective Re-render** | High | UI flickering/corruption | Ensure component IDs are stable across updates. |

## 9. Migration Strategy
1.  **Step 1**: Add `InteractionClassifier` to `runStreamingPipeline`. Default everything to `new_report` to keep behavior identical.
2.  **Step 2**: Enable `summarize_report` and `analyze_report` first (safest, no UI changes).
3.  **Step 3**: Introduce the `WorkspaceTransformer` for structural edits (renaming, reordering).
4.  **Step 4**: Implement the `Singleton Report` frontend mode to eliminate duplicate charts.
