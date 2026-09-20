import "dotenv/config";
import makeWASocket, {
	useMultiFileAuthState,
	DisconnectReason,
	fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";

import { runAgent } from "./agent.js";
import { getSession, setSession } from "./store.js";

const logger = pino({ level: "silent" });

async function startBaileysBot() {
	console.log("\n==================================================");
	console.log("🚀 Starting OpenSpace WhatsApp Bot (Baileys)...");
	console.log("==================================================\n");

	const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
	const { version } = await fetchLatestBaileysVersion();

	const sock = makeWASocket({
		version,
		auth: state,
		logger,
		printQRInTerminal: false,
		defaultQueryTimeoutMs: undefined,
		browser: ["OpenSpace AI", "Chrome", "1.0.0"]
	});

	// Save session credentials whenever updated
	sock.ev.on("creds.update", saveCreds);

	// Optional Phone Number Pairing Code (No camera scanning needed)
	const rawPhone = process.env.BOT_PHONE_NUMBER || "";
	const botPhoneNumber = rawPhone.replace(/[^0-9]/g, "");

	if (!sock.authState.creds.registered && botPhoneNumber) {
		setTimeout(async () => {
			try {
				const code = await sock.requestPairingCode(botPhoneNumber);
				const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
				console.log("\n==================================================");
				console.log(`🔑 YOUR WHATSAPP PAIRING CODE:  ${formattedCode}`);
				console.log("==================================================");
				console.log("📱 Steps on Phone:");
				console.log("1. Open WhatsApp -> Settings / 3-dots menu -> Linked Devices");
				console.log("2. Tap 'Link a Device'");
				console.log("3. Tap 'Link with phone number instead' at the bottom");
				console.log(`4. Enter the code: ${formattedCode}\n`);
			} catch (err) {
				console.error("Error requesting pairing code:", err);
			}
		}, 3000);
	}

	// Handle Connection Updates (QR Code & Status)
	sock.ev.on("connection.update", async (update) => {
		const { connection, lastDisconnect, qr } = update;

		if (qr && !botPhoneNumber) {
			console.log("\n📲 SCAN THIS QR CODE WITH WHATSAPP (Linked Devices):\n");
			qrcode.generate(qr, { small: true });
			console.log("Steps: Open WhatsApp on Phone -> Settings -> Linked Devices -> Link a Device.");
			console.log("💡 Tip: To use a Pairing Code instead, set BOT_PHONE_NUMBER in your .env!\n");
		}

		if (connection === "close") {
			const statusCode = lastDisconnect?.error?.output?.statusCode;
			const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
			console.log(`⚠️ Connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);

			if (shouldReconnect) {
				setTimeout(startBaileysBot, 3000);
			} else {
				console.log("❌ Logged out from WhatsApp. Please delete 'auth_info_baileys' folder and restart.");
			}
		} else if (connection === "open") {
			console.log("\n==================================================");
			console.log("✅ OpenSpace WhatsApp Assistant is CONNECTED & READY!");
			console.log(`🤖 Logged in as: ${sock.user?.id?.split(":")[0] || sock.user?.name || "OpenSpace"}`);
			console.log("==================================================");
			console.log("💬 Send a message from any user to chat with OpenSpace AI!\n");
		}
	});

	// Handle Incoming Messages
	sock.ev.on("messages.upsert", async ({ messages, type }) => {
		if (type !== "notify") return;

		for (const msg of messages) {
			// Ignore messages sent by the bot itself
			if (msg.key.fromMe) continue;

			const remoteJid = msg.key.remoteJid;
			if (!remoteJid) continue;

			// Ignore status broadcasts
			if (remoteJid === "status@broadcast") continue;

			// Extract message text
			const text =
				msg.message?.conversation ||
				msg.message?.extendedTextMessage?.text ||
				msg.message?.imageMessage?.caption ||
				"";

			const trimmedText = text.trim();
			if (!trimmedText) continue;

			const senderNumber = remoteJid.split("@")[0];
			const rawPushName = msg.pushName || null; // undefined until WhatsApp actually sends one
			const pushName = rawPushName || "Customer"; // display-only fallback for console logs

			console.log(`\n📩 [Message Received] From: ${pushName} (+${senderNumber})`);
			console.log(`💬 Text: "${trimmedText}"`);

			try {
				// Show typing indicator
				await sock.sendPresenceUpdate("composing", remoteJid);

				const session = getSession(remoteJid);
				console.log(`🤖 Generating OpenSpace AI Response...`);

				const t0 = Date.now();
				const { reply, newSession } = await runAgent({
					from: remoteJid,
					userText: trimmedText,
					session,
					contactName: rawPushName
				});
				console.log(`⏱ Agent took ${Date.now() - t0}ms`);

				setSession(remoteJid, newSession);

				// Send the AI reply back to WhatsApp
				await sock.sendMessage(remoteJid, { text: reply });
				console.log(`📤 [Reply Sent to +${senderNumber}]:\n${reply}\n`);

				// Reset presence
				await sock.sendPresenceUpdate("paused", remoteJid);
			} catch (err) {
				console.error(`❌ Error processing message from +${senderNumber}:`, err);
				await sock.sendMessage(remoteJid, {
					text: "Sorry, I encountered a temporary issue. Please try again shortly or reach out to hello@openspace.finance."
				});
			}
		}
	});
}

startBaileysBot().catch((err) => {
	console.error("Fatal error starting Baileys bot:", err);
});
