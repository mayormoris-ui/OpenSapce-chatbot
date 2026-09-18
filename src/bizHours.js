function parseRange(range) {
	if (!range || range.toUpperCase() === "CLOSED") {
		return null;
	}
	// "09:00-17:00" -> { startMin, endMin }
	const parts = range.split("-");
	if (parts.length !== 2) return null;

	const [start, end] = parts;
	const toMin = (hhmm) => {
		const [h, m] = hhmm.split(":").map(Number);
		return (h || 0) * 60 + (m || 0);
	};
	return { startMin: toMin(start), endMin: toMin(end) };
}

function getLocalParts(timeZone) {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false
	});

	const parts = fmt.formatToParts(new Date());
	const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

	return {
		weekday: map.weekday, // Mon Tue Wed Thu Fri Sat Sun
		minutes: Number(map.hour) * 60 + Number(map.minute)
	};
}

export function isWithinBusinessHours() {
	const tz = process.env.COMPANY_TIMEZONE || process.env.RESTAURANT_TIMEZONE || "Africa/Lagos";
	const { weekday, minutes } = getLocalParts(tz);

	const monFri = process.env.BIZ_HOURS_MON_FRI || "09:00-17:00";
	const sat = process.env.BIZ_HOURS_SAT || "CLOSED";
	const sun = process.env.BIZ_HOURS_SUN || "CLOSED";

	let rangeStr = monFri;
	if (weekday === "Sat") rangeStr = sat;
	if (weekday === "Sun") rangeStr = sun;

	const parsed = parseRange(rangeStr);
	if (!parsed) return false;

	const { startMin, endMin } = parsed;
	return minutes >= startMin && minutes < endMin;
}
