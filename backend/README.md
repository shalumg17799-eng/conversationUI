# Generative UI Backend — Multi-Component Report Hub

A production-ready, modular backend for a Generative UI system built with Node.js, TypeScript, and Claude (Anthropic). This system transforms natural language queries into structured, sectioned BI reports (KPIs, Charts, Tables) for dynamic frontend rendering.

## ✨ What we have achieved

In this phase, we moved from a single-component mock system to a **live, multi-component analytical engine**:

*   **8-Layer Deterministic Pipeline**: A sophisticated lifecycle that ensures data is always correctly mapped to UI, with the LLM used only for the "creative" decision of visualization type.
*   **Multi-Component Reports**: The system doesn't just show one chart; it composes a full dashboard containing an **Overview** (KPIs), **Deep Dive** (Charts), and **Data Details** (Tables).
*   **Automatic Prop Mapping**: No more manual prop generation. The backend automatically detects X/Y axes, numeric formatting, and categories based on the data shape.
*   **Validation & Safety**: Every component is validated against a schema registry. If a chart isn't suitable for the data, the system automatically falls back to a Table view with a user-friendly notice.
*   **Evaluation Framework**: A built-in benchmark tool to measure the accuracy of the AI's visualization choices.

---

## 🏗 How it Works (The 8-Layer Pipeline)

We use a **"Deterministic-First"** approach. The LLM is the brain, but the pipeline is the skeleton:

1.  **Intent**: Understand what the user wants (Metric, Dimension, Time).
2.  **Data Analysis**: Profile the data (How many rows? Are they dates or categories?).
3.  **Filtering**: Remove UI components that won't work with this data.
4.  **Short-Circuit**: If it's a single number, skip the AI and just show a KPI.
5.  **AI Decision**: Ask Claude 3 Haiku: "Given this data shape, which chart is best?"
6.  **Prop Mapping**: Automatically wire the data columns to the chosen chart.
7.  **Validation**: Double-check the final UI object against our standards.
8.  **Composition**: Assemble everything into sections (Summary, Analysis, Details).

---

## 🚀 Getting Started (Run the Backend)

Follow these steps to get the analytical engine running on your machine:

### 1. Prerequisites
*   **Node.js** (v18 or higher)
*   **Anthropic API Key**: Required for the AI decision layer.

### 2. Setup & Installation
Open your terminal in the `backend` directory:
```bash
cd backend
npm install
```

### 3. Environment Configuration
Ensure your `.env` file in the `backend` folder contains your API key:
```env
ANTHROPIC_API_KEY=your_key_here
PORT=3001
```

### 4. Start the Server
Run the following command to start the engine in development mode:
```bash
npm run dev
```
The server will start at **http://localhost:3001**.

---

## 🧪 Advanced Usage

### Run Evaluation Benchmark
To test how well the AI is selecting components across 15+ real-world scenarios:
```bash
# In the backend directory
npx ts-node src/evaluation/runEvaluation.ts
```

### API Testing
You can test the endpoint using `curl` or Postman:
**POST** `http://localhost:3001/api/conversational`
**Body:** `{"query": "Show revenue by region"}`

---

## 📂 Folder Structure
*   `src/pipeline/`: The core logic that orchestrates the 8 layers.
*   `src/services/`: Individual logic for intent, mapping, and AI calls.
*   `src/registry/`: The "Source of Truth" for what our UI components can do.
*   `src/evaluation/`: Tools to measure system accuracy.

## 🛠 Tech Stack
*   **TypeScript / Node.js**
*   **Express.js** (API Framework)
*   **Claude 3 Haiku** (Anthropic AI)
*   **Zod/JSON Schema** (Validation)
