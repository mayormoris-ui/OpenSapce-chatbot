import { loadFaq } from "./faq.js";
import { isWithinBusinessHours } from "./bizHours.js";

function templateEnvVars(text) {
	if (!text) return text;

	return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => {
		if (process.env[key] !== undefined && process.env[key] !== "") {
			return process.env[key];
		}

		// Fallbacks for company details
		if (key === "COMPANY_NAME") return process.env.RESTAURANT_NAME || "OpenSpace";
		if (key === "COMPANY_PHONE") return process.env.RESTAURANT_PHONE || "+234 201 3309 599";
		if (key === "COMPANY_EMAIL") return "hello@openspace.finance";
		if (key === "COMPANY_WEBSITE") return "https://openspace.finance";
		if (key === "COMPANY_TIMEZONE") return process.env.RESTAURANT_TIMEZONE || "Africa/Lagos";
		if (key === "BIZ_HOURS_MON_FRI") return "09:00-17:00";
		if (key === "BIZ_HOURS_SAT") return "CLOSED";
		if (key === "BIZ_HOURS_SUN") return "CLOSED";

		return "";
	});
}

export async function lookupFaq({ question }) {
	const q = question || "";
	const faq = loadFaq();

	const hit = faq.entries.find((e) => e._regexes.some((r) => r.test(q)));
	if (!hit) return null;

	return templateEnvVars(hit.answer);
}

// Aliased for backwards compatibility
export const lookupRestaurantFaq = lookupFaq;

export async function createSupportTicketStub({ from, draft }) {
	const ticketId = `TKT-${Math.floor(Math.random() * 900000 + 100000)}`;
	return {
		ticketId,
		from,
		issueType: draft.issueType || "Payment / Transaction Issue",
		transactionRef: draft.transactionRef || "N/A",
		amount: draft.amount || "N/A",
		description: draft.description || "General Issue Report",
		name: draft.name || "Valued Customer",
		email: draft.email || "Provided via WhatsApp",
		createdAt: new Date().toISOString(),
		status: "OPEN (Logged in OpenSpace Support System)"
	};
}

export async function createProductInquiryStub({ from, draft }) {
	const inquiryId = `REQ-${Math.floor(Math.random() * 900000 + 100000)}`;
	return {
		inquiryId,
		from,
		serviceType: draft.serviceType || "OpenSpace Fintech Product",
		details: draft.details || draft.amountOrNeeds || "General Inquiry",
		name: draft.name || "Prospective Client",
		email: draft.email || "Provided via WhatsApp",
		createdAt: new Date().toISOString(),
		status: "RECEIVED (Specialist Assigned)"
	};
}

export async function checkTransactionStatusStub({ txRef }) {
	const cleanRef = (txRef || "").trim().toUpperCase();
	if (!cleanRef) return null;

	// Demo simulation for transaction check
	return {
		txRef: cleanRef,
		status: "PROCESSING_OR_COMPLETED",
		amount: "NGN 50,000.00",
		timestamp: new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }),
		message: `Transaction ${cleanRef} is currently recorded in the settlement pipeline.`
	};
}

export async function handoffToHumanStub({ from, summary }) {
	const available = isWithinBusinessHours();
	const handoffId = `ESC-${Math.floor(Math.random() * 90000 + 10000)}`;

	return {
		handoffId,
		available,
		from,
		summary,
		email: process.env.COMPANY_EMAIL || "hello@openspace.finance",
		phone: process.env.COMPANY_PHONE || "+234 201 3309 599"
	};
}

/**
 * Notify the customer service agent with a full escalation payload.
 * In production, replace the console.log block with your email/Slack/CRM
 * notification logic (e.g. send an email via Nodemailer, post to Slack
 * webhook, or create a CRM ticket via API).
 *
 * @param {object} opts
 * @param {string}  opts.from          - WhatsApp number of the customer
 * @param {string}  opts.escalationId  - ESC-xxxxx reference
 * @param {string}  opts.issueType     - e.g. "Failed Transaction", "General Issue"
 * @param {string}  opts.description   - Detailed description of the problem
 * @param {string}  [opts.name]        - Customer's full name
 * @param {string}  [opts.email]       - Customer's email address
 * @param {string}  [opts.transactionId] - Transaction ref / session ID
 * @param {string}  [opts.receiptUrl]  - URL or status of receipt/screenshot
 * @param {string}  [opts.amount]      - Transaction amount involved
 * @param {object}  [opts.extra]       - Any additional key-value metadata
 */
export async function notifyCustomerServiceAgent({
	from,
	escalationId,
	issueType,
	description,
	name,
	email,
	transactionId,
	receiptUrl,
	amount,
	extra = {}
}) {
	const available = isWithinBusinessHours();
	const timestamp = new Date().toISOString();

	const payload = {
		escalationId,
		timestamp,
		customerWhatsApp: from,
		customerName: name || "Unknown",
		customerEmail: email || "Not provided",
		issueType: issueType || "Unclassified Issue",
		description: description || "No description provided",
		transactionId: transactionId || "N/A",
		receiptUrl: receiptUrl || "Not provided",
		amount: amount || "N/A",
		agentAvailable: available,
		...extra
	};

	// ── Production hook ─────────────────────────────────────────────────────
	// Replace this block with your real notification logic, for example:
	//
	//   await sendEscalationEmail(payload);          // email via Nodemailer
	//   await postToSlack(payload);                  // Slack webhook
	//   await createCrmTicket(payload);              // CRM API call
	//
	// ────────────────────────────────────────────────────────────────────────
	console.log(
		`\n${"-".repeat(60)}\n` +
		`[🚨 CUSTOMER SERVICE ESCALATION]\n` +
		`Escalation ID : ${payload.escalationId}\n` +
		`Timestamp     : ${payload.timestamp}\n` +
		`Customer      : ${payload.customerName} (${payload.customerWhatsApp})\n` +
		`Email         : ${payload.customerEmail}\n` +
		`Issue Type    : ${payload.issueType}\n` +
		`Description   : ${payload.description}\n` +
		`Transaction ID: ${payload.transactionId}\n` +
		`Amount        : ${payload.amount}\n` +
		`Receipt       : ${payload.receiptUrl}\n` +
		`Agent Online  : ${payload.agentAvailable ? "YES" : "NO (outside hours)"}\n` +
		`${"-".repeat(60)}`
	);

	return { payload, available };
}
