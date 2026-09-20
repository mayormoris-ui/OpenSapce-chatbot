import OpenAI from "openai";
import {
	lookupFaq,
	createSupportTicketStub,
	createProductInquiryStub,
	checkTransactionStatusStub,
	handoffToHumanStub
} from "./tools.js";
import { isWithinBusinessHours } from "./bizHours.js";

const openai = new OpenAI({
	apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
	baseURL: process.env.AI_BASE_URL || "https://api.groq.com/openai/v1"
});

function mustHaveEnv() {
	if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
		throw new Error("Missing GROQ_API_KEY or OPENAI_API_KEY in environment variables");
	}
}

function companyContext() {
	return {
		name: process.env.COMPANY_NAME || process.env.RESTAURANT_NAME || "OpenSpace",
		email: process.env.COMPANY_EMAIL || "hello@openspace.finance",
		phone: process.env.COMPANY_PHONE || "+234 201 3309 599",
		website: process.env.COMPANY_WEBSITE || "https://openspace.finance",
		tz: process.env.COMPANY_TIMEZONE || "Africa/Lagos"
	};
}

// WhatsApp display names are sometimes a full name, sometimes a nickname or
// even an emoji — using just the first whitespace-separated token reads
// naturally in a greeting ("Hi Chidinma!") without assuming it's a real
// first/last name split. If that token has no actual letters in it (e.g. an
// emoji-led nickname like "🔥 Big Boss 🔥"), skip it rather than greet
// someone with "Hi 🔥!".
function firstNameOf(displayName) {
	if (!displayName || typeof displayName !== "string") return null;
	const trimmed = displayName.trim();
	if (!trimmed) return null;
	const token = trimmed.split(/\s+/)[0];
	return /\p{L}/u.test(token) ? token : null;
}

// -------------------------------------------------------------
// Flow 1: Dispute / Issue Reporting Slot Extraction & Questioning
// -------------------------------------------------------------
function missingDisputeFields(draft) {
	const missing = [];
	if (!draft.description && !draft.issueType) missing.push("description");
	if (!draft.amount) missing.push("amount");
	if (!draft.transactionRef) missing.push("transactionRef");
	if (!draft.name) missing.push("name");
	return missing;
}

function nextDisputeQuestion(missing) {
	const field = missing[0];
	switch (field) {
		case "description":
			return "Could you briefly describe the issue (e.g., transfer not received, double debit, POS decline)?";
		case "amount":
			return "What was the transaction amount involved (e.g., 50,000 NGN)?";
		case "transactionRef":
			return "Do you have the Transaction Reference or Session ID? (If you don't have it, just type 'none')";
		case "name":
			return "Please provide your full name so we can locate your OpenSpace profile.";
		case "email":
			return "What is your registered email address?";
		default:
			return "Could you provide any additional details for this dispute?";
	}
}

async function extractDisputeFields({ model, userText }) {
	const extractorSystem = `
Extract transaction dispute / support issue details from the user message.
Return JSON only:
{
  "issueType": string|null,
  "transactionRef": string|null,
  "amount": string|null,
  "description": string|null,
  "name": string|null,
  "email": string|null,
  "cancel": boolean
}
Rules:
- If user wants to cancel or stop logging the dispute, set cancel=true.
- If user says they don't have reference ID (or "none", "no"), set transactionRef to "N/A".
- If no value present, use null.
`;

	const extraction = await openai.chat.completions.create({
		model,
		messages: [
			{ role: "system", content: extractorSystem.trim() },
			{ role: "user", content: userText }
		],
		response_format: { type: "json_object" }
	});

	try {
		return JSON.parse(extraction.choices[0].message.content);
	} catch {
		return {};
	}
}

// -------------------------------------------------------------
// Flow 2: Product / Loan Inquiry Slot Extraction & Questioning
// -------------------------------------------------------------
function missingInquiryFields(draft) {
	const missing = [];
	if (!draft.serviceType) missing.push("serviceType");
	if (!draft.details) missing.push("details");
	if (!draft.name) missing.push("name");
	return missing;
}

function nextInquiryQuestion(missing) {
	const field = missing[0];
	switch (field) {
		case "serviceType":
			return "Which OpenSpace service are you interested in? (Personal Loan, Business Loan, Business Banking, Open Nearby, or Open Invest)";
		case "details":
			return "Could you share the amount or specific requirements you have in mind?";
		case "name":
			return "What is your full name?";
		case "email":
			return "What is the best email or phone number for our team to follow up with?";
		default:
			return "What other details would you like to share?";
	}
}

async function extractInquiryFields({ model, userText }) {
	const extractorSystem = `
Extract product inquiry or loan application lead details from the user's message.
Services include: Personal Loan, Business Loan, Business Banking, Open Nearby (Agent Banking), Open Invest (Savings/Investments), Wallet/Account Creation.
Return JSON only:
{
  "serviceType": string|null,
  "details": string|null,
  "name": string|null,
  "email": string|null,
  "cancel": boolean
}
Rules:
- If user wants to cancel/stop, set cancel=true.
- If no value present, use null.
`;

	const extraction = await openai.chat.completions.create({
		model,
		messages: [
			{ role: "system", content: extractorSystem.trim() },
			{ role: "user", content: userText }
		],
		response_format: { type: "json_object" }
	});

	try {
		return JSON.parse(extraction.choices[0].message.content);
	} catch {
		return {};
	}
}

function mergeDraft(draft, parsed, allowedKeys) {
	const next = { ...draft };
	for (const key of allowedKeys) {
		const v = parsed?.[key];
		if (v !== null && v !== undefined && v !== "") next[key] = v;
	}
	return next;
}

// -------------------------------------------------------------
// Main Agent Handler
// -------------------------------------------------------------
// Returns true when the AI should address the user by name.
// Rules: always on the first message, then once every NAME_INTERVAL messages.
const NAME_INTERVAL = 4;
function shouldUseName(session) {
	const count = session.messageCount || 0; // 0-indexed before increment
	return count === 0 || count % NAME_INTERVAL === 0;
}

export async function runAgent({ from, userText, session, contactName }) {
	mustHaveEnv();
	const model = process.env.GROQ_MODEL || process.env.OPENAI_MODEL || "openai/gpt-oss-120b";
	const info = companyContext();

	if (!session.draft) session.draft = {};

	// Remember the WhatsApp contact's name for the life of this session, even
	// if a later message doesn't resend it (Twilio only sends ProfileName on
	// some messages; Baileys usually sends pushName on every message but we
	// don't want a one-off missing value to make the bot "forget" someone
	// mid-conversation).
	if (contactName && !session.contactName) {
		session.contactName = contactName;
	}
	const displayName = firstNameOf(session.contactName);

	// Determine whether this turn should address the user by name, then
	// increment the counter so the next call gets the correct position.
	const useName = displayName && shouldUseName(session);
	session.messageCount = (session.messageCount || 0) + 1;

	const history = (session.history || []).slice(-10);

	// --- 1. Ongoing DISPUTE Flow Mode ---
	if (session.flow === "DISPUTE") {
		const parsed = await extractDisputeFields({ model, userText });

		if (parsed.cancel) {
			session.flow = null;
			session.draft = {};
			const reply = "Understood. I have cancelled the dispute report. How else can I assist you today?";
			session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: reply }];
			return { reply, newSession: session };
		}

		session.draft = mergeDraft(session.draft, parsed, [
			"issueType",
			"transactionRef",
			"amount",
			"description",
			"name",
			"email"
		]);

		const missing = missingDisputeFields(session.draft);
		if (missing.length > 0) {
			const reply = nextDisputeQuestion(missing);
			session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: reply }];
			return { reply, newSession: session };
		}

		const result = await createSupportTicketStub({ from, draft: session.draft });
		session.flow = null;
		session.draft = {};

		const msg =
			(displayName ? `Thanks, ${displayName}! ` : "") +
			`📋 *Support Ticket Logged Successfully*\n\n` +
			`• *Ticket ID:* ${result.ticketId}\n` +
			`• *Customer:* ${result.name}\n` +
			`• *Issue:* ${result.description}\n` +
			`• *Amount:* ${result.amount}\n` +
			`• *Reference:* ${result.transactionRef}\n` +
			`• *Status:* ${result.status}\n\n` +
			`Our support team is reviewing your case and will follow up shortly. You can also reach us directly at ${info.email}.`;

		session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: msg }];
		return { reply: msg, newSession: session };
	}

	// --- 2. Ongoing INQUIRY Flow Mode ---
	if (session.flow === "INQUIRY") {
		const parsed = await extractInquiryFields({ model, userText });

		if (parsed.cancel) {
			session.flow = null;
			session.draft = {};
			const reply = "No problem — I have cancelled this application request. What else can I help you with?";
			session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: reply }];
			return { reply, newSession: session };
		}

		session.draft = mergeDraft(session.draft, parsed, [
			"serviceType",
			"details",
			"name",
			"email"
		]);

		const missing = missingInquiryFields(session.draft);
		if (missing.length > 0) {
			const reply = nextInquiryQuestion(missing);
			session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: reply }];
			return { reply, newSession: session };
		}

		const result = await createProductInquiryStub({ from, draft: session.draft });
		session.flow = null;
		session.draft = {};

		const msg =
			(displayName ? `Thanks, ${displayName}! ` : "") +
			`🚀 *Request Received*\n\n` +
			`• *Reference ID:* ${result.inquiryId}\n` +
			`• *Name:* ${result.name}\n` +
			`• *Product / Service:* ${result.serviceType}\n` +
			`• *Details:* ${result.details}\n\n` +
			`An ${info.name} specialist will contact you to finalize the setup. Feel free to ask if you have any questions in the meantime!`;

		session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: msg }];
		return { reply: msg, newSession: session };
	}

	// --- 3. Normal Mode: Plan Intent & Action ---
	const withinHours = isWithinBusinessHours();

	const systemPrompt = `
You are the official WhatsApp AI assistant for "${info.name}", a modern fintech company.
${info.name} products & services:
1. Account & Digital Wallet Creation (Fast online KYC, instant virtual accounts)
2. Business Banking (SME accounts, corporate payroll, invoicing, merchant tools)
3. Personal Loans & Business Loans (Flexible financing, quick approvals)
4. Open Nearby (Agent banking, POS terminals, cash-in/cash-out)
5. Open Invest (High-yield savings & structured investment plans)
6. Transaction tracking, transfer help, and payment dispute management

Contact & Operating details:
- Email: ${info.email}
- Phone: ${info.phone}
- Support Hours: Mon–Fri 9:00 AM - 5:00 PM WAT
- Current Support Availability: ${withinHours ? "ONLINE (Within Business Hours)" : "OFFLINE (Outside Business Hours)"}

${useName
	? `The user's first name is "${displayName}". You MUST address them by this name somewhere in your reply — naturally woven in (e.g. at the start of a greeting or at the end of a confirmation), not bolted on awkwardly.`
	: displayName
		? `The user's first name is "${displayName}". Do NOT use their name in this reply — keep it name-free to avoid repetition. Only address them by name on the first message, at closing confirmations, and every few messages.`
		: `The user's name is not known yet — do not guess or invent one. If it becomes useful (e.g. logging a ticket), ask for it naturally.`}

Identify user intent and return JSON only:
{
  "intent": "FAQ"|"DISPUTE"|"INQUIRY"|"TX_STATUS"|"HANDOFF"|"GENERAL",
  "startDispute": boolean,
  "startInquiry": boolean,
  "startHandoff": boolean,
  "faqQuery": string|null,
  "txRef": string|null,
  "handoffSummary": string|null,
  "reply": string
}
Guidelines:
- If user wants to report a failed payment, dispute, chargeback, or money deducted without credit, set startDispute=true and intent="DISPUTE".
- If user wants to apply for a loan, start business banking, join Open Nearby agent network, or invest, set startInquiry=true and intent="INQUIRY".
- If user asks a product question, onboarding steps, contact, or hours, set intent="FAQ" with a concise faqQuery.
- If user explicitly requests a human / agent / manager, set startHandoff=true.
- Keep replies professional, clear, and reassuring.
`;

	const decision = await openai.chat.completions.create({
		model,
		messages: [
			{ role: "system", content: systemPrompt.trim() },
			...history,
			{ role: "user", content: userText }
		],
		response_format: { type: "json_object" }
	});

	let plan;
	try {
		plan = JSON.parse(decision.choices[0].message.content);
	} catch {
		plan = {
			intent: "GENERAL",
			startDispute: false,
			startInquiry: false,
			startHandoff: false,
			faqQuery: null,
			txRef: null,
			handoffSummary: null,
			reply: displayName
				? `Hi ${displayName}! 👋 Welcome to ${info.name}! How can I assist you with your accounts, loans, investments, or transfers today?`
				: `Welcome to ${info.name}! How can I assist you with your accounts, loans, investments, or transfers today?`
		};
	}

	// A. Check FAQ First
	if (plan.intent === "FAQ" || plan.faqQuery) {
		const answer = await lookupFaq({ question: plan.faqQuery || userText });
		if (answer) {
			session.history = [
				...history,
				{ role: "user", content: userText },
				{ role: "assistant", content: answer }
			];
			return { reply: answer, newSession: session };
		}
	}

	// B. Transaction Status Check
	if (plan.intent === "TX_STATUS" && plan.txRef) {
		const statusResult = await checkTransactionStatusStub({ txRef: plan.txRef });
		if (statusResult) {
			const reply =
				`🔍 *Transaction Status Lookup*\n` +
				`• *Reference:* ${statusResult.txRef}\n` +
				`• *Amount:* ${statusResult.amount}\n` +
				`• *Timestamp:* ${statusResult.timestamp}\n` +
				`• *Status:* ${statusResult.message}\n\n` +
				`Need further assistance or want to log a dispute for this transaction? Just reply "dispute".`;

			session.history = [
				...history,
				{ role: "user", content: userText },
				{ role: "assistant", content: reply }
			];
			return { reply, newSession: session };
		}
	}

	// C. Start Dispute Flow
	if (plan.startDispute || plan.intent === "DISPUTE") {
		session.flow = "DISPUTE";
		session.draft = {};

		const initialParsed = await extractDisputeFields({ model, userText });
		if (initialParsed.cancel) {
			session.flow = null;
			session.draft = {};
			const reply = "Dispute logging cancelled. How else can I help you today?";
			session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: reply }];
			return { reply, newSession: session };
		}

		session.draft = mergeDraft({}, initialParsed, [
			"issueType",
			"transactionRef",
			"amount",
			"description",
			"name",
			"email"
		]);

		const missing = missingDisputeFields(session.draft);
		const reply = missing.length > 0
			? nextDisputeQuestion(missing)
			: "Please confirm your full name so we can record this support ticket.";

		session.history = [
			...history,
			{ role: "user", content: userText },
			{ role: "assistant", content: reply }
		];

		if (missing.length === 0 && session.draft.name) {
			const result = await createSupportTicketStub({ from, draft: session.draft });
			session.flow = null;
			session.draft = {};

			const msg =
				(displayName ? `Thanks, ${displayName}! ` : "") +
				`📋 *Support Ticket Logged (Ref: ${result.ticketId})*\n\n` +
				`• *Name:* ${result.name}\n` +
				`• *Issue:* ${result.description}\n` +
				`• *Amount:* ${result.amount}\n` +
				`• *Transaction Ref:* ${result.transactionRef}\n\n` +
				`Our dispute team will review this and notify you at ${result.email || "this WhatsApp number"}.`;

			session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: msg }];
			return { reply: msg, newSession: session };
		}

		return { reply, newSession: session };
	}

	// D. Start Product / Loan Inquiry Flow
	if (plan.startInquiry || plan.intent === "INQUIRY") {
		session.flow = "INQUIRY";
		session.draft = {};

		const initialParsed = await extractInquiryFields({ model, userText });
		if (initialParsed.cancel) {
			session.flow = null;
			session.draft = {};
			const reply = "Request cancelled. Let me know if you need information on any other OpenSpace services.";
			session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: reply }];
			return { reply, newSession: session };
		}

		session.draft = mergeDraft({}, initialParsed, [
			"serviceType",
			"details",
			"name",
			"email"
		]);

		const missing = missingInquiryFields(session.draft);
		const reply = missing.length > 0
			? nextInquiryQuestion(missing)
			: "Could you provide your full name so our product specialist can reach out?";

		session.history = [
			...history,
			{ role: "user", content: userText },
			{ role: "assistant", content: reply }
		];

		if (missing.length === 0 && session.draft.name) {
			const result = await createProductInquiryStub({ from, draft: session.draft });
			session.flow = null;
			session.draft = {};

			const msg =
				(displayName ? `Thanks, ${displayName}! ` : "") +
				`🚀 *Inquiry Submitted (Ref: ${result.inquiryId})*\n\n` +
				`• *Name:* ${result.name}\n` +
				`• *Product:* ${result.serviceType}\n` +
				`• *Details:* ${result.details}\n\n` +
				`Our ${info.name} team has received your request and will contact you shortly!`;

			session.history = [...history, { role: "user", content: userText }, { role: "assistant", content: msg }];
			return { reply: msg, newSession: session };
		}

		return { reply, newSession: session };
	}

	// E. Start Human Escalation
	if (plan.startHandoff || plan.intent === "HANDOFF") {
		const summary = plan.handoffSummary || userText;
		const result = await handoffToHumanStub({ from, summary });

		const reply = result.available
			? `👨‍💼 *Connecting to Support*\n\n${displayName ? `Thanks ${displayName}, ` : ""}I’m alerting our support team right now.\n• *Reference:* ${result.handoffId}\n• *Phone:* ${result.phone}\n• *Email:* ${result.email}\n\nPlease leave any additional details here and an agent will respond directly.`
			: `🕒 *Support Outside Operating Hours*\n\n${displayName ? `Thanks ${displayName}, our` : "Our"} team is currently offline (Operating hours: Mon–Fri 9:00 AM - 5:00 PM WAT).\n• *Reference:* ${result.handoffId}\n• *Email:* ${result.email}\n\nPlease leave your message and email address here, and we will get back to you first thing when we open!`;

		session.history = [
			...history,
			{ role: "user", content: userText },
			{ role: "assistant", content: reply }
		];

		return { reply, newSession: session };
	}

	// F. Default Assistant Response
	const defaultGreeting = displayName ? `Hi ${displayName}! 👋 Welcome to ${info.name}!` : `Welcome to ${info.name}!`;
	const reply =
		typeof plan.reply === "string" && plan.reply.trim()
			? plan.reply.trim()
			: `${defaultGreeting} I can help you with:\n1. 💳 Account & Wallet Creation\n2. 🏢 Business Banking\n3. 💰 Personal & Business Loans\n4. 📍 Open Nearby & Open Invest\n5. ⚠️ Transaction Help & Disputes\n\nHow can I help you today?`;

	session.history = [
		...history,
		{ role: "user", content: userText },
		{ role: "assistant", content: reply }
	];

	return { reply, newSession: session };
}
