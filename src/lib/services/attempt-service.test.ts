import { beforeEach, describe, expect, it, vi } from "vitest";

type McqRow = { id: string };

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

const { mockDb, resetDb, seedMcq } = vi.hoisted(() => {
	const mcqs: McqRow[] = [];
	const choices: ChoiceRow[] = [];
	const attempts: AttemptRow[] = [];

	function exec(sql: string, params: unknown[]) {
		if (sql.includes("INSERT INTO mcq_attempts")) {
			const [id, mcq_id, choice_id, is_correct] = params as [string, string, string, number];
			const row: AttemptRow = {
				id,
				mcq_id,
				choice_id,
				is_correct: Number(is_correct),
			};
			attempts.push(row);
			return { results: [row] };
		}

		if (sql.includes("FROM mcq_choices") && sql.includes("WHERE id")) {
			const [id] = params as string[];
			return { results: choices.filter((choice) => choice.id === id) };
		}

		if (sql.includes("FROM mcqs") && sql.includes("WHERE id")) {
			const [id] = params as string[];
			return { results: mcqs.filter((mcq) => mcq.id === id) };
		}

		if (sql.includes("FROM mcq_attempts")) {
			const [id] = params as string[];
			return { results: attempts.filter((attempt) => attempt.id === id) };
		}

		return { results: [] };
	}

	const mockDb = {
		prepare(sql: string) {
			function bound(params: unknown[]) {
				return {
					async all() {
						return exec(sql, params);
					},
				};
			}

			return {
				...bound([]),
				bind(...params: unknown[]) {
					return bound(params);
				},
			};
		},
	};

	return {
		mockDb,
		resetDb() {
			mcqs.length = 0;
			choices.length = 0;
			attempts.length = 0;
		},
		seedMcq() {
			const mcqId = crypto.randomUUID();
			const otherMcqId = crypto.randomUUID();
			const wrongChoiceId = crypto.randomUUID();
			const rightChoiceId = crypto.randomUUID();
			const foreignChoiceId = crypto.randomUUID();

			mcqs.push({ id: mcqId }, { id: otherMcqId });
			choices.push(
				{ id: wrongChoiceId, mcq_id: mcqId, is_correct: 0 },
				{ id: rightChoiceId, mcq_id: mcqId, is_correct: 1 },
				{ id: foreignChoiceId, mcq_id: otherMcqId, is_correct: 1 },
			);

			return { mcqId, otherMcqId, wrongChoiceId, rightChoiceId, foreignChoiceId };
		},
	};
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(async () => mockDb),
}));

import { McqNotFoundError } from "./mcq-service";
import { createAttempt } from "./attempt-service";

describe("attempt service", () => {
	beforeEach(() => {
		resetDb();
		vi.clearAllMocks();
	});

	it("createAttempt stores mcqId, choiceId, and isCorrect copied from that choice", async () => {
		const { mcqId, rightChoiceId } = seedMcq();

		const attempt = await createAttempt(mcqId, rightChoiceId);

		expect(attempt.id).toEqual(expect.any(String));
		expect(attempt.mcqId).toBe(mcqId);
		expect(attempt.choiceId).toBe(rightChoiceId);
		expect(attempt.isCorrect).toBe(true);
		expect(attempt).not.toHaveProperty("is_correct");
	});

	it("createAttempt returns isCorrect true when the selected choice is the correct one", async () => {
		const { mcqId, rightChoiceId } = seedMcq();

		const attempt = await createAttempt(mcqId, rightChoiceId);

		expect(attempt.isCorrect).toBe(true);
	});

	it("createAttempt returns isCorrect false when the selected choice is not the correct one", async () => {
		const { mcqId, wrongChoiceId } = seedMcq();

		const attempt = await createAttempt(mcqId, wrongChoiceId);

		expect(attempt.isCorrect).toBe(false);
	});

	it("createAttempt with a choice that does not belong to the MCQ is rejected as not-found", async () => {
		const { mcqId, foreignChoiceId } = seedMcq();

		await expect(createAttempt(mcqId, foreignChoiceId)).rejects.toBeInstanceOf(McqNotFoundError);
	});

	it("createAttempt with an unknown MCQ id is rejected as not-found", async () => {
		const { rightChoiceId } = seedMcq();

		await expect(createAttempt("missing-mcq", rightChoiceId)).rejects.toBeInstanceOf(McqNotFoundError);
	});
});
