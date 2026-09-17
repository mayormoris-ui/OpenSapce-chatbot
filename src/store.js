const processedMessageSids = new Set();
const sessionState = new Map();

/**
 * Session schema per WhatsApp user:
 * {
 *   history: OpenAI chat messages (rolling window),
 *   flow: null | "DISPUTE" | "INQUIRY",
 *   draft: {
 *     // For DISPUTE flow:
 *     issueType?: string,
 *     transactionRef?: string,
 *     amount?: string,
 *     description?: string,
 *     name?: string,
 *     email?: string,
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
			draft: {}
		}
	);
}

export function setSession(userId, session) {
	sessionState.set(userId, session);
}
