export const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const SAFE_HOST = /^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/;
export const SAFE_TICKET = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,127}$/;
export const MAX_OPERATION_ID_LENGTH = 253 + 1 + 64;

export function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertPlainObject(value, label) {
	if (!isPlainObject(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value;
}

export function assertExactKeys(value, allowed, label) {
	const record = assertPlainObject(value, label);
	const unexpected = Object.keys(record).filter((key) => !allowed.includes(key));
	if (unexpected.length > 0) {
		throw new Error(`${label} contains unsupported field(s): ${unexpected.join(", ")}`);
	}
	return record;
}

export function assertSafeId(value, label) {
	if (typeof value !== "string" || !SAFE_ID.test(value)) {
		throw new Error(`${label} must match ${SAFE_ID}`);
	}
	return value;
}

export function assertSafeHost(value, label) {
	if (typeof value !== "string" || !SAFE_HOST.test(value)) {
		throw new Error(`${label} must be one literal inventory alias`);
	}
	return value;
}

export function assertSafeTicket(value, label, { optional = false } = {}) {
	if (value === undefined && optional) return undefined;
	if (typeof value !== "string" || !SAFE_TICKET.test(value)) {
		throw new Error(`${label} must be one single-line ticket/incident identifier`);
	}
	return value;
}

export function assertBoundedString(value, label, maxLength, { optional = false } = {}) {
	if (value === undefined && optional) return undefined;
	if (typeof value !== "string") {
		throw new Error(`${label} must be a string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${label} must not be empty`);
	}
	if (trimmed.length > maxLength) {
		throw new Error(`${label} exceeds ${maxLength} characters`);
	}
	if (/[^\t\n\r\x20-\x7e\u0080-\uffff]/u.test(trimmed)) {
		throw new Error(`${label} contains a control character`);
	}
	return trimmed;
}

export function assertUniqueStrings(value, label, { min = 0, max, pattern } = {}) {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array`);
	}
	if (value.length < min) {
		throw new Error(`${label} must contain at least ${min} item(s)`);
	}
	if (max !== undefined && value.length > max) {
		throw new Error(`${label} exceeds the limit of ${max}`);
	}

	const seen = new Set();
	return value.map((item, index) => {
		if (typeof item !== "string" || !item) {
			throw new Error(`${label}[${index}] must be a nonempty string`);
		}
		if (pattern && !pattern.test(item)) {
			throw new Error(`${label}[${index}] has an unsafe value: ${item}`);
		}
		if (seen.has(item)) {
			throw new Error(`${label} contains a duplicate: ${item}`);
		}
		seen.add(item);
		return item;
	});
}

export function assertStringList(value, label, { maxItems, maxLength } = {}) {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array`);
	}
	if (maxItems !== undefined && value.length > maxItems) {
		throw new Error(`${label} exceeds the limit of ${maxItems}`);
	}
	return value.map((item, index) =>
		assertBoundedString(item, `${label}[${index}]`, maxLength ?? 300),
	);
}
