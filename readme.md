# OpenSpace WhatsApp Fintech AI Assistant (Node.js, Twilio & OpenAI)

An AI-powered WhatsApp assistant built for **OpenSpace** (a modern fintech company) using Twilio's WhatsApp Messaging API, Node.js, and OpenAI.

---

## 🌟 OpenSpace Capabilities

- **💳 Account & Wallet Creation**: Guided onboarding steps and KYC information (BVN, NIN, ID verification).
- **🏢 Business Banking**: SME accounts, corporate payroll, invoicing, and merchant collections.
- **💰 Personal & Business Loans**: Loan product information, eligibility inquiries, and guided application intake.
- **📍 Open Nearby**: Agent banking network, POS terminals, and cash-in/cash-out services.
- **📈 Open Invest**: High-yield automated savings and regulated investment plans.
- **⚠️ Transaction Support & Dispute Management**: Multi-turn dispute reporting (reference, amount, issue type) with trackable ticket generation (`TKT-xxxxxx`).
- **🔍 Transaction Status Check**: Instant reference lookup.
- **🕒 Business Hours & Human Escalation**: Operating schedule (Mon–Fri 9am–5pm WAT) with live support routing and ticket logging (`ESC-xxxxx`).

---

## 🏗️ Architecture Overview

```
User (WhatsApp)
       ↓
 Twilio Webhook
       ↓
  src/server.js
       ↓
  src/agent.js (OpenAI Intent & Slot Extraction)
   ├── data/faq.json (OpenSpace Knowledge Base)
   ├── src/bizHours.js (WAT Timezone & Operating Hours)
   ├── src/tools.js (Support Tickets, Product Leads, Status Check, Escalation)
   └── src/store.js (Session State & Memory)
       ↓
 Twilio REST API → WhatsApp Reply
```

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```env
PORT=3000
PUBLIC_WEBHOOK_URL=https://your-domain-or-ngrok.ngrok-free.app/twilio/whatsapp

TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

COMPANY_NAME=OpenSpace
COMPANY_EMAIL=hello@openspace.finance
COMPANY_PHONE=+234 201 3309 599
COMPANY_WEBSITE=https://openspace.finance
COMPANY_TIMEZONE=Africa/Lagos

BIZ_HOURS_MON_FRI=09:00-17:00
BIZ_HOURS_SAT=CLOSED
BIZ_HOURS_SUN=CLOSED
```

### 3. Run Locally

```bash
npm run dev
```

---

## 📞 Support & Contacts

- **Email**: hello@openspace.finance
- **Phone**: +234 201 3309 599
- **Operating Hours**: Monday – Friday, 9:00 AM – 5:00 PM WAT
