import "dotenv/config";
import express from "express";
import morgan from "morgan";
import twilio from "twilio";

import { validateTwilioWebhook } from "./twilio.js";
import { hasProcessed, markProcessed, getSession, setSession } from "./store.js";
import { runAgent } from "./agent.js";

const app = express();
app.use(morgan("dev"));

// Twilio sends application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
	res.status(200).send("OpenSpace WhatsApp Assistant Server Running.");
});

app.post(["/twilio/whatsapp", "/tw", "/webhook"], async (req, res) => {
	try {
		const publicUrl = process.env.PUBLIC_WEBHOOK_URL;
		console.log(`\n[📩 Incoming Message] From: ${req.body?.From}, Text: "${req.body?.Body}"`);

		if (publicUrl) {
			const valid = validateTwilioWebhook({ req, publicUrl });
			if (!valid) {
				console.warn("[⚠️ Twilio Webhook] Signature validation mismatch (allowed for dev/ngrok).");
			}
		}

		const messageSid = req.body.MessageSid;
		const from = req.body.From; // "whatsapp:+..."
		const body = (req.body.Body || "").trim();
		const profileName = req.body.ProfileName || null; // WhatsApp display name, when Twilio has it

		if (!from) {
			return res.status(400).send("Bad request: Missing 'From' field.");
		}

		// Idempotency check for Twilio retries
		if (messageSid && hasProcessed(messageSid)) {
			console.log(`[Duplicate skipped] MessageSid: ${messageSid}`);
			const emptyTwiml = new twilio.twiml.MessagingResponse();
			return res.type("text/xml").send(emptyTwiml.toString());
		}
		if (messageSid) markProcessed(messageSid);

		const twiml = new twilio.twiml.MessagingResponse();

		if (!body) {
			const welcomeMsg = profileName
				? `Welcome to OpenSpace, ${profileName.trim().split(/\s+/)[0]}! How can I assist you with your accounts, loans, or transfers today?`
				: "Welcome to OpenSpace! How can I assist you with your accounts, loans, or transfers today?";
			twiml.message(welcomeMsg);
			return res.type("text/xml").send(twiml.toString());
		}

		const session = getSession(from);
		console.log(`[🤖 Generating AI Response...]`);
		const t0 = Date.now();
		const { reply, newSession } = await runAgent({ from, userText: body, session, contactName: profileName });
		console.log(`[⏱ Agent took ${Date.now() - t0}ms]`);
		//const { reply, newSession } = await runAgent({ from, userText: body, session });

		setSession(from, newSession);
		console.log(`[📤 Sending Reply to ${from}]:\n${reply}\n`);

		// Official Twilio MessagingResponse format with <Body> tag
		twiml.message(reply);
		// return res.type("text/xml").send(twiml.toString());
		console.log(`This is the comment i just added: ${twiml.toString()}`);
		res.writeHead(200, {
			'Content-Type': 'text/xml'
		});
		res.end(twiml.toString());
	} catch (err) {
		console.error("[❌ Server Error]:", err);
		const twiml = new twilio.twiml.MessagingResponse();
		twiml.message("Sorry, we encountered a temporary issue. Please try again shortly or email hello@openspace.finance.");
		res.type("text/xml").send(twiml.toString());
	}
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`🚀 OpenSpace WhatsApp Server listening on :${port}`));
