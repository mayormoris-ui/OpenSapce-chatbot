/**
 * notify.js — Customer Care Forwarding
 *
 * Sends structured WhatsApp messages to the configured CUSTOMER_CARE_NUMBER
 * whenever a support ticket is created or a human-handoff is triggered.
 *
 * The Baileys `sock` instance is passed in from baileys.js (the only place
 * the live connection is accessible).
 *
 * Fails silently on error — the user still gets their confirmation, and the
 * failure is logged to the console for investigation.
 */

/**
 * Build the Baileys JID for the care agent number.
 * Returns null if CUSTOMER_CARE_NUMBER is not set.
 */
function getCareAgentJid() {
	const raw = (process.env.CUSTOMER_CARE_NUMBER || "").replace(/\D/g, "").trim();
	if (!raw) return null;
	return `${raw}@s.whatsapp.net`;
}

/**
 * Forward a newly created support ticket to the care agent.
 *
 * @param {import("@whiskeysockets/baileys").WASocket} sock
 * @param {object} ticket  - The object returned by createSupportTicketStub
 * @param {string} customerJid - The WhatsApp JID of the customer (e.g. "2348012345678@s.whatsapp.net")
 */
export async function forwardTicketToAgent(sock, ticket, customerJid) {
	const careJid = getCareAgentJid();
	if (!careJid) {
		console.warn("⚠️  [notify] CUSTOMER_CARE_NUMBER not set — skipping ticket forwarding.");
		return;
	}

	const customerNumber = customerJid ? customerJid.split("@")[0] : "Unknown";

	const message =
		`🎫 *New Support Ticket — Action Required*\n\n` +
		`• *Ticket ID:* ${ticket.ticketId}\n` +
		`• *Customer:* ${ticket.name}\n` +
		`• *Customer WhatsApp:* +${customerNumber}\n` +
		`• *Issue Type:* ${ticket.issueType}\n` +
		`• *Description:* ${ticket.description}\n` +
		`• *Amount:* ${ticket.amount}\n` +
		`• *Transaction Ref:* ${ticket.transactionRef}\n` +
		`• *Logged At:* ${new Date(ticket.createdAt).toLocaleString("en-US", { timeZone: process.env.COMPANY_TIMEZONE || "Africa/Lagos" })}\n\n` +
		`Please follow up with the customer directly via WhatsApp or email (${ticket.email}).`;

	try {
		await sock.sendMessage(careJid, { text: message });
		console.log(`📨 [notify] Ticket ${ticket.ticketId} forwarded to care agent (+${careJid.split("@")[0]})`);
	} catch (err) {
		console.error(`❌ [notify] Failed to forward ticket ${ticket.ticketId} to care agent:`, err?.message || err);
	}
}

/**
 * Notify the care agent when a customer explicitly requests a human agent.
 *
 * @param {import("@whiskeysockets/baileys").WASocket} sock
 * @param {object} handoff  - The object returned by handoffToHumanStub
 * @param {string} customerJid - The WhatsApp JID of the customer
 */
export async function forwardHandoffToAgent(sock, handoff, customerJid) {
	const careJid = getCareAgentJid();
	if (!careJid) {
		console.warn("⚠️  [notify] CUSTOMER_CARE_NUMBER not set — skipping handoff forwarding.");
		return;
	}

	const customerNumber = customerJid ? customerJid.split("@")[0] : "Unknown";

	const message =
		`🆘 *Customer Requesting Human Agent*\n\n` +
		`• *Escalation ID:* ${handoff.handoffId}\n` +
		`• *Customer WhatsApp:* +${customerNumber}\n` +
		`• *Their Summary:* "${handoff.summary}"\n` +
		`• *Requested At:* ${new Date().toLocaleString("en-US", { timeZone: process.env.COMPANY_TIMEZONE || "Africa/Lagos" })}\n\n` +
		`Please reach out to the customer directly on WhatsApp: +${customerNumber}`;

	try {
		await sock.sendMessage(careJid, { text: message });
		console.log(`📨 [notify] Handoff ${handoff.handoffId} forwarded to care agent (+${careJid.split("@")[0]})`);
	} catch (err) {
		console.error(`❌ [notify] Failed to forward handoff ${handoff.handoffId} to care agent:`, err?.message || err);
	}
}
