import "server-only";

import { getDb } from "@/lib/db";

export class McqValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McqValidationError";
	}
}

export class McqNotFoundError extends Error {
	constructor(message = "MCQ not found") {
		super(message);
		this.name = "McqNotFoundError";
	}
}

export type McqChoiceInput = {
	id?: string;
	label: string;
	isCorrect: boolean;
};

export type NewMcq = {
	name: string;
	question: string;
	createdByUserId: string;
	choices: McqChoiceInput[];
};

export type UpdateMcq = {
	name: string;
	question: string;
	choices: McqChoiceInput[];
};

export type McqListItem = {
	id: string;
	name: string;
	question: string;
	createdByUserId: string;
	createdAt: string;
	updatedAt: string;
};

export type McqChoice = {
	id: string;
	label: string;
	isCorrect: boolean;
	position: number;
};

export type McqWithChoices = McqListItem & {
	choices: McqChoice[];
};

type McqRow = {
	id: string;
	name: string;
	question: string;
	created_by_user_id: string;
	created_at: string;
	updated_at: string;
};

type ChoiceRow = {
	id: string;
	mcq_id: string;
	label: string;
	is_correct: number;
	position: number;
};

type UserIdRow = {
	id: string;
};

function requireNonEmpty(value: string, field: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new McqValidationError(`${field} is required`);
	}
	return trimmed;
}

function validateChoices(choices: McqChoiceInput[]) {
	if (choices.length < 2 || choices.length > 6) {
		throw new McqValidationError("An MCQ must have between 2 and 6 choices");
	}

	const normalized = choices.map((choice) => ({
		...choice,
		label: requireNonEmpty(choice.label, "choice label"),
	}));

	const correctCount = normalized.filter((choice) => choice.isCorrect).length;
	if (correctCount !== 1) {
		throw new McqValidationError("Exactly one choice must be correct");
	}

	return normalized;
}

function toListItem(row: McqRow): McqListItem {
	return {
		id: row.id,
		name: row.name,
		question: row.question,
		createdByUserId: row.created_by_user_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toChoice(row: ChoiceRow): McqChoice {
	return {
		id: row.id,
		label: row.label,
		isCorrect: row.is_correct === 1,
		position: row.position,
	};
}

async function assertUserExists(userId: string) {
	const db = await getDb();
	const { results } = await db
		.prepare("SELECT id FROM users WHERE id = ?1")
		.bind(userId)
		.all<UserIdRow>();

	if (!results[0]) {
		throw new McqValidationError("Unknown createdByUserId");
	}
}

async function loadChoices(mcqId: string): Promise<McqChoice[]> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, mcq_id, label, is_correct, position
			 FROM mcq_choices
			 WHERE mcq_id = ?1
			 ORDER BY position ASC`,
		)
		.bind(mcqId)
		.all<ChoiceRow>();

	return results.map(toChoice);
}

export async function create(input: NewMcq): Promise<McqWithChoices> {
	const name = requireNonEmpty(input.name, "name");
	const question = requireNonEmpty(input.question, "question");
	const createdByUserId = requireNonEmpty(input.createdByUserId, "createdByUserId");
	const choices = validateChoices(input.choices);

	await assertUserExists(createdByUserId);

	const db = await getDb();
	const mcqId = crypto.randomUUID();

	const statements = [
		db
			.prepare(
				`INSERT INTO mcqs (id, name, question, created_by_user_id)
				 VALUES (?1, ?2, ?3, ?4)
				 RETURNING id, name, question, created_by_user_id, created_at, updated_at`,
			)
			.bind(mcqId, name, question, createdByUserId),
		...choices.map((choice, index) =>
			db
				.prepare(
					`INSERT INTO mcq_choices (id, mcq_id, label, is_correct, position)
					 VALUES (?1, ?2, ?3, ?4, ?5)
					 RETURNING id, mcq_id, label, is_correct, position`,
				)
				.bind(crypto.randomUUID(), mcqId, choice.label, choice.isCorrect ? 1 : 0, index + 1),
		),
	];

	await db.batch(statements);

	const created = await findById(mcqId);
	if (!created) {
		throw new Error("Failed to create MCQ");
	}

	return created;
}

export async function list(): Promise<McqListItem[]> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, name, question, created_by_user_id, created_at, updated_at
			 FROM mcqs
			 ORDER BY created_at DESC`,
		)
		.all<McqRow>();

	return results.map(toListItem);
}

export async function findById(id: string): Promise<McqWithChoices | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, name, question, created_by_user_id, created_at, updated_at
			 FROM mcqs
			 WHERE id = ?1`,
		)
		.bind(id)
		.all<McqRow>();

	const row = results[0];
	if (!row) {
		return null;
	}

	return {
		...toListItem(row),
		choices: await loadChoices(id),
	};
}

export async function update(id: string, input: UpdateMcq): Promise<McqWithChoices> {
	const name = requireNonEmpty(input.name, "name");
	const question = requireNonEmpty(input.question, "question");
	const choices = validateChoices(input.choices);

	const existing = await findById(id);
	if (!existing) {
		throw new McqNotFoundError();
	}

	const db = await getDb();
	const incomingIds = new Set(choices.flatMap((choice) => (choice.id ? [choice.id] : [])));

	const statements = [
		db
			.prepare(
				`UPDATE mcqs
				 SET name = ?1,
				     question = ?2,
				     updated_at = CURRENT_TIMESTAMP
				 WHERE id = ?3
				 RETURNING id, name, question, created_by_user_id, created_at, updated_at`,
			)
			.bind(name, question, id),
		...existing.choices
			.filter((choice) => !incomingIds.has(choice.id))
			.map((choice) => db.prepare("DELETE FROM mcq_choices WHERE id = ?1").bind(choice.id)),
		...choices.map((choice, index) => {
			const position = index + 1;
			const isCorrect = choice.isCorrect ? 1 : 0;

			if (choice.id) {
				return db
					.prepare(
						`UPDATE mcq_choices
						 SET label = ?1,
						     is_correct = ?2,
						     position = ?3,
						     updated_at = CURRENT_TIMESTAMP
						 WHERE id = ?4 AND mcq_id = ?5
						 RETURNING id, mcq_id, label, is_correct, position`,
					)
					.bind(choice.label, isCorrect, position, choice.id, id);
			}

			return db
				.prepare(
					`INSERT INTO mcq_choices (id, mcq_id, label, is_correct, position)
					 VALUES (?1, ?2, ?3, ?4, ?5)
					 RETURNING id, mcq_id, label, is_correct, position`,
				)
				.bind(crypto.randomUUID(), id, choice.label, isCorrect, position);
		}),
	];

	await db.batch(statements);

	const updated = await findById(id);
	if (!updated) {
		throw new McqNotFoundError();
	}

	return updated;
}

export async function deleteMcq(id: string): Promise<void> {
	const db = await getDb();
	const { results } = await db
		.prepare("DELETE FROM mcqs WHERE id = ?1 RETURNING id")
		.bind(id)
		.all<{ id: string }>();

	if (!results[0]) {
		throw new McqNotFoundError();
	}
}
