import "server-only";

import { getDb } from "@/lib/db";
import { McqNotFoundError } from "@/lib/services/mcq-service";

export type Attempt = {
	id: string;
	mcqId: string;
	choiceId: string;
	isCorrect: boolean;
};

type McqIdRow = {
	id: string;
};

type ChoiceRow = {
	id: string;
	mcq_id: string;
	is_correct: number;
};

type AttemptRow = {
	id: string;
	mcq_id: string;
	choice_id: string;
	is_correct: number;
};

function toAttempt(row: AttemptRow): Attempt {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		choiceId: row.choice_id,
		isCorrect: row.is_correct === 1,
	};
}

export async function createAttempt(mcqId: string, choiceId: string): Promise<Attempt> {
	const db = await getDb();

	const { results: mcqRows } = await db
		.prepare("SELECT id FROM mcqs WHERE id = ?1")
		.bind(mcqId)
		.all<McqIdRow>();

	if (!mcqRows[0]) {
		throw new McqNotFoundError();
	}

	const { results: choiceRows } = await db
		.prepare(
			`SELECT id, mcq_id, is_correct
			 FROM mcq_choices
			 WHERE id = ?1`,
		)
		.bind(choiceId)
		.all<ChoiceRow>();

	const choice = choiceRows[0];
	if (!choice || choice.mcq_id !== mcqId) {
		throw new McqNotFoundError();
	}

	const { results: attemptRows } = await db
		.prepare(
			`INSERT INTO mcq_attempts (id, mcq_id, choice_id, is_correct)
			 VALUES (?1, ?2, ?3, ?4)
			 RETURNING id, mcq_id, choice_id, is_correct`,
		)
		.bind(crypto.randomUUID(), mcqId, choiceId, choice.is_correct)
		.all<AttemptRow>();

	const row = attemptRows[0];
	if (!row) {
		throw new Error("Failed to create attempt");
	}

	return toAttempt(row);
}
