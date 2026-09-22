const processedMessageSids = new Set();
const sessionState = new Map();

/**
 * Session schema per WhatsApp user:
 * {
 *   history: OpenAI chat messages (rolling window),
 *   flow: null | "DISPUTE" | "INQUIRY",
 *   contactName: string | null, // WhatsApp display name (Baileys pushName /
 *                                // Twilio ProfileName), remembered for the
 *                                // life of the session so replies can greet
 *                                // the user by name.
 *   messageCount: number,        // Total messages exchanged, used for name cadence.
 *   draft: {
 *     // For DISPUTE flow:
 *     issueType?: string,
 *     transactionRef?: string,
 *     amount?: string,
 *     description?: string,
 *     name?: string,
 *     email?: string,
 *     receiptUrl?: string,       // WhatsApp media key / path of uploaded receipt screenshot.
 *     receiptProvided?: boolean, // true once user has sent (or declined) a receipt image.
 *     escalated?: boolean,       // true once the case has been forwarded to a human agent.
 *
 *     // For INQUIRY flow (Loans, Business Banking, Open Nearby, Open Invest):
 *     serviceType?: string,
 *     details?: string,
 *     name?: string,
 *     email?: string
 *   }
 * }
 */

export function hasProcessed(messageSid) {
	return processedMessageSids.has(messageSid);
}

export function markProcessed(messageSid) {
	processedMessageSids.add(messageSid);
}

export function getSession(userId) {
	return (
		sessionState.get(userId) ?? {
			history: [],
			flow: null,
			contactName: null,
			draft: {}
		}
	);
}

export function setSession(userId, session) {
	sessionState.set(userId, session);
}
