# Aria — Voice-First Agentic Desktop Assistant

![Aria Banner](banner/image.png)

> An accessibility-first voice AI built for blind and visually impaired users. You speak; Aria reasons about what you need and acts — browsing the web, controlling your Mac, writing code, or taking notes — in one continuous spoken conversation.

[![Electron](https://img.shields.io/badge/Electron-2B2E3A?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![LangGraph](https://img.shields.io/badge/LangGraph-1C3C3C?style=for-the-badge&logo=langgraph&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Deepgram](https://img.shields.io/badge/Deepgram-0A5F46?style=for-the-badge&logo=deepgram&logoColor=white)](https://deepgram.com)
[![Cartesia TTS](https://img.shields.io/badge/Cartesia_TTS-5B21B6?style=for-the-badge)](https://cartesia.ai)
[![Claude](https://img.shields.io/badge/Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-005571?style=for-the-badge&logo=elasticsearch&logoColor=white)](https://elastic.co)
[![Vitest](https://img.shields.io/badge/Vitest-4A7C1B?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev)

---

## Highlights

- Orchestrated **5 specialized agents** for shopping, coding, browsing, desktop control, and notes through a **LangGraph supervisor** in a full-duplex Electron voice assistant, combining Deepgram transcription and Cartesia speech streaming for interaction latency under **1 second**.
- Gated **3 high-risk action classes** behind spoken confirmation before execution — destructive shell commands, payments, and sensitive text entry — and scanned for **4 PII types**, including SSNs and card numbers, before the assistant typed into apps.
- Scoped pending approvals to the active session and expired them after **2 minutes**, so a stale "yes" can never execute the wrong action later in a long voice conversation.
- Indexed routing events and **4 confirmation outcomes** (`confirm_required`, `resumed`, `cancelled`, `reask`) in Elasticsearch, exposing the latest **50** records through `/api/audit/:sessionId` for auditability.
- Built **3 runtime surfaces** — Electron desktop app, Next.js web client, and a Node.js Socket.io server — to coordinate real-time voice, agent routing, and local automation.
- Separated **2 automation paths**: Stagehand for browser control, and macOS AppleScript/JXA for desktop control, because browser and desktop automation fail in different ways.
- Covered **4 critical safety areas** with Vitest: the PII scanner, the ethics rules, the confirmation store, and supervisor confirmation routing.

---

## Architecture

```mermaid
flowchart LR
    MIC["Microphone"] --> STT["Deepgram nova-3<br/>streaming STT"]
    STT --> SUP["LangGraph Supervisor<br/>intent routing"]

    SUP --> CM["Commerce Agent"]
    SUP --> GEN["General Agent"]
    SUP --> COD["Coding Agent"]
    SUP --> DSK["Desktop Agent"]
    SUP --> DOC["Documentation Agent"]

    CM --> GATE{"Safety Gate"}
    COD --> GATE
    DSK --> GATE
    DOC --> GATE
    GEN --> TTS

    GATE -->|"low risk"| EXEC["Execution layer"]
    GATE -->|"high risk"| ASK["Spoken confirmation<br/>2-minute expiry"]
    ASK --> EXEC

    EXEC --> WEB["Stagehand<br/>browser automation"]
    EXEC --> MAC["AppleScript / JXA<br/>macOS automation"]
    EXEC --> AUD["Elasticsearch<br/>audit index"]

    EXEC --> TTS["Cartesia<br/>streaming TTS"]
    TTS --> SPK["Speaker"]
```

## Request lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant S as Deepgram STT
    participant G as LangGraph Supervisor
    participant A as Specialized Agent
    participant P as PII + Ethics Gate
    participant E as Executor
    participant T as Cartesia TTS

    U->>S: speaks
    S-->>G: partial transcript stream
    G->>A: route to 1 of 5 agents
    A->>P: proposed action
    alt high-risk class
        P-->>T: "Confirm before I continue?"
        T-->>U: spoken question
        U->>P: "yes" (valid 2 minutes)
    end
    P->>E: approved action
    E->>E: index outcome in Elasticsearch
    E-->>T: result text
    T-->>U: streamed speech (under 1s)
```

---

## The five agents

| Agent | What it does |
|---|---|
| **Commerce** | Browses, searches products, compares prices and ratings, can add to cart and check out |
| **General** | Navigates any website, reads and summarizes articles, answers factual questions |
| **Coding** | Reads, writes and edits files, runs shell commands, debugs errors, searches the codebase |
| **Desktop** | Controls macOS via screenshots plus mouse and keyboard — opens apps, clicks, navigates UIs |
| **Documentation** | Dictates and files notes, including Apple Notes |

## Safety model

| Control | Scope |
|---|---|
| Spoken confirmation gate | Destructive shell commands, payments/checkout, sensitive text entry |
| PII scanner | SSNs, credit card numbers, emails, phone numbers — checked before any typing |
| Approval expiry | Pending approvals scoped to the session, expire after 2 minutes |
| Audit trail | Routing + `confirm_required` / `resumed` / `cancelled` / `reask` indexed in Elasticsearch |

## Tech stack

**Voice** Deepgram nova-3 STT · Cartesia WebSocket TTS
**Agents** LangGraph · LangChain · Anthropic Claude · OpenAI · Ollama
**Automation** Stagehand (web) · AppleScript / JXA (macOS)
**Runtime** Electron · React · Vite · Next.js · Node.js · Express · Socket.io
**Observability** Elasticsearch audit index · Vitest

## Getting started

```bash
git clone https://github.com/Brijesh03032001/Aria.git
cd Aria
npm install
cp .env.example .env     # DEEPGRAM_API_KEY, CARTESIA_API_KEY, ANTHROPIC_API_KEY
npm run dev              # Socket.io server + Electron app
```

```bash
npm run test             # Vitest: PII scanner, ethics rules, confirmation routing
```

---

**Built by [Brijesh Kumar](https://github.com/Brijesh03032001)** · [Portfolio](https://brijeshbuilds.com) · [LinkedIn](https://linkedin.com/in/brijeshkumar03)
