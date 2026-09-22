# OpenSpace WhatsApp Fintech AI Assistant — System Design & Architecture Documentation

## 1. Executive Summary

The **OpenSpace WhatsApp AI Assistant** is an intelligent conversational agent engineered to automate customer support, product inquiries, onboarding guidance, loan applications, and payment dispute management for **OpenSpace**, a modern financial technology (fintech) platform.

Built on Node.js, the system interfaces directly with WhatsApp via the **Baileys Multi-Device Protocol** (with optional Twilio Webhook support) and leverages ultra-fast, high-capacity Large Language Models (LLMs) via the **Groq API** to deliver deterministic FAQ answers, multi-turn guided flows, and transactional operations in real time.

---

## 2. Technology Stack

| Layer | Technology | Purpose / Rationale |
| :--- | :--- | :--- |
| **Runtime Environment** | **Node.js (v18+ / v20+ / v24+)** | Non-blocking, event-driven I/O ideal for real-time WebSocket communication and asynchronous API handling. |
| **Module System** | **ECMAScript Modules (ESM)** | Modern, standardized JavaScript module architecture (`import`/`export`). |
| **Transport Layer** | **`@whiskeysockets/baileys`** | Pure WebSocket-based WhatsApp Web protocol implementation. Enables 100% free, multi-device connectivity without browser overhead. |
| **Secondary Transport** | **Express.js + Twilio SDK** | Fallback HTTP webhook server supporting enterprise Twilio Messaging pipelines. |
| **AI / Inference Engine** | **Groq Cloud API (`openai/gpt-oss-120b`)** | Sub-second LLM inference with structured JSON object extraction, natural language intent classification, and multi-turn dialogue management. |
| **AI Client Interface** | **`openai` npm SDK** | Universal OpenAI-compatible client configured with Groq's low-latency base URL. |
| **Knowledge Base** | **Pattern-Matching JSON Engine** | High-speed, regex-driven deterministic FAQ retrieval with dynamic environment variable substitution. |
| **State Management** | **In-Memory Session Store** | Per-user session state tracking conversation history, active flow states (`DISPUTE`, `INQUIRY`), and draft entities. |
| **Business Time Logic** | **`Intl.DateTimeFormat`** | Timezone-aware operating hours engine customized for West Africa Time (`Africa/Lagos`). |

---

## 3. High-Level Architecture

```
                                  ┌─────────────────────────────────────────┐
                                  │             WhatsApp User               │
                                  └────────────────────┬────────────────────┘
                                                       │
                                            (WhatsApp Protocol / E2EE)
                                                       │
                                                       ▼
                                  ┌─────────────────────────────────────────┐
                                  │      Transport Layer (src/baileys.js)    │
                                  │     - Multi-File Auth State             │
                                  │     - Message Ingestion & Typing Events │
                                  │     - Outbound Reply Dispatch           │
                                  └────────────────────┬────────────────────┘
                                                       │
                                                       ▼
                                  ┌─────────────────────────────────────────┐
                                  │       Agent Orchestrator (src/agent.js) │
                                  │     - Intent Classification             │
                                  │     - Structured Slot Filling           │
                                  │     - System Prompt & Personas          │
                                  └──────┬──────────────┬─────────────┬─────┘
                                         │              │             │
                    ┌────────────────────┘              │             └───────────────────┐
                    ▼                                   ▼                                 ▼
   ┌─────────────────────────────────┐ ┌────────────────────────────────┐ ┌────────────────────────────────┐
   │ Knowledge Base (data/faq.json)  │ │ Business Tools (src/tools.js)  │ │ Session Store (src/store.js)   │
   │ - 12+ Fintech FAQ Rules         │ │ - Support Ticket Generation    │ │ - 10-turn Rolling Context      │
   │ - Regex Pattern Matching        │ │ - Product Inquiry Leads        │ │ - Active Flow Machine          │
   │ - Variable Interpolation        │ │ - Transaction Status Lookup    │ │ - Entity Draft Records         │
   │ - Zero-LLM Instant Hits         │ │ - Human Agent Escalation       │ │ - Idempotency Message IDs      │
   └─────────────────────────────────┘ └────────────────┬───────────────┘ └────────────────────────────────┘
                                                        │
                                                        ▼
                                       ┌────────────────────────────────┐
                                       │ Business Hours (src/bizHours.js│
                                       │ - WAT (Africa/Lagos) Timezone  │
                                       │ - Mon-Fri 09:00 - 17:00        │
                                       └────────────────────────────────┘
```

---

## 4. Core System Components

### 4.1 Transport Layer (`src/baileys.js`)
- **Connection Management:** Initializes a WebSocket connection using `@whiskeysockets/baileys`. Authentication credentials are saved locally in the `auth_info_baileys/` folder, ensuring sessions survive server restarts.
- **Authentication Modes:**
  - **Phone Number Pairing Code:** Uses `sock.requestPairingCode(phoneNumber)` to generate a human-readable 8-character code for linking without camera scanning.
  - **QR Code Terminal:** Renders terminal ASCII QR codes for standard camera linking.
- **Event Lifecycle:**
  - `messages.upsert`: Captures incoming text, image captions, and extended text; ignores self-sent messages and status broadcasts; displays typing presence (`composing`) during AI execution.

### 4.2 Agent Cognitive Engine (`src/agent.js`)
The agent operates a dual-mode decision engine:

1. **Stateful Flow Mode (Active Slot Filling):**
   - When `session.flow` is set to `DISPUTE` or `INQUIRY`, incoming messages are routed to dedicated JSON schema extractors (`extractDisputeFields`, `extractInquiryFields`).
   - The engine checks for missing mandatory fields and asks targeted, single-question prompts until all required information is gathered.
   - Upon completion, the respective business tool is executed, session state is cleared, and a structured confirmation card is returned.

2. **Autonomous Intent Classification Mode (Normal Mode):**
   - Evaluates the conversation history + new user message against OpenSpace's system persona and available services.
   - Evaluates intents: `FAQ`, `DISPUTE`, `INQUIRY`, `TX_STATUS`, `HANDOFF`, or `GENERAL`.

### 4.3 Knowledge Base & Rule Engine (`data/faq.json`, `src/faq.js`, `src/tools.js`)
- Contains categorized fintech topics:
  - **Account & Wallet Creation:** Onboarding steps, Tier 1/2/3 KYC requirements (BVN, NIN, ID).
  - **Business Banking:** Corporate accounts, payroll, invoicing, POS terminals.
  - **Personal & Business Loans:** Eligibility criteria, tenor, interest rates, capital financing.
  - **Open Nearby:** Agency banking, cash-in/cash-out points, agent registration.
  - **Open Invest:** Automated savings plans, high-yield investment options.
  - **Transaction Support:** Settlement windows, receipt downloads, failed transfer troubleshooting.
  - **Company Identity:** Support email (`hello@openspace.finance`), telephone (`+234 201 3309 599`), operating hours.

---

## 5. Conversational Flow State Machine

1. **Idle State:** Awaits incoming customer WhatsApp message.
2. **Deterministic Pattern Match:** If message matches a defined pattern in `data/faq.json`, returns the pre-compiled answer immediately.
3. **LLM Cognitive Resolution:** If no exact regex match, the LLM classifies intent:
   - **`DISPUTE`**: Enters multi-turn dispute flow to collect `amount`, `transactionRef`, `description`, `name`, `email` -> issues ticket `TKT-xxxxxx`.
   - **`INQUIRY`**: Enters multi-turn lead intake to collect `serviceType`, `details`, `name`, `email` -> issues reference `REQ-xxxxxx`.
   - **`TX_STATUS`**: Queries transaction status stub and returns live state card.
   - **`HANDOFF`**: Evaluates WAT business hours (`isWithinBusinessHours`) and connects to human support or leaves an offline message with escalation reference (`ESC-xxxxx`).
   - **`GENERAL`**: Returns contextual AI response.

---

## 6. Security, Compliance & Data Governance

1. **Zero Hardcoded Secrets:** All credentials (`GROQ_API_KEY`, `TWILIO_AUTH_TOKEN`) are injected via environment variables.
2. **Session Privacy:** The WhatsApp authentication directory (`auth_info_baileys/`) and `.env` are strictly excluded from version control via `.gitignore`.
3. **Idempotency Protection:** Message deduplication prevents double processing on network retries.
4. **Resilience & Auto-Reconnect:** Baileys automatically handles temporary network drops and reconnects without user intervention.

---

## 7. Configuration Reference

```env
# AI Model Provider
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=openai/gpt-oss-120b

# WhatsApp Pairing (Optional)
BOT_PHONE_NUMBER=234xxxxxxxxxx

# Company Details
COMPANY_NAME=OpenSpace
COMPANY_EMAIL=hello@openspace.finance
COMPANY_PHONE=+234 201 3309 599
COMPANY_WEBSITE=https://openspace.finance
COMPANY_TIMEZONE=Africa/Lagos

# Business Operating Hours
BIZ_HOURS_MON_FRI=09:00-17:00
BIZ_HOURS_SAT=CLOSED
BIZ_HOURS_SUN=CLOSED
```
