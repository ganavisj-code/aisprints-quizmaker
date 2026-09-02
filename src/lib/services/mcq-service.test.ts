import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = { id: string };

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

const { mockDb, resetDb, seedUser } = vi.hoisted(() => {
	const users: UserRow[] = [];
	const mcqs: McqRow[] = [];
	const choices: ChoiceRow[] = [];
	let clock = 0;

	function nextTime() {
		clock += 1;
		return `2026-09-02T00:00:00.${String(clock).padStart(3, "0")}Z`;
	}

	function exec(sql: string, params: unknown[]) {
		if (sql.includes("FROM users") && sql.includes("WHERE id")) {
			const [id] = params as string[];
			return { results: users.filter((user) => user.id === id) };
		}

		if (sql.includes("INSERT INTO mcqs")) {
			const [id, name, question, created_by_user_id] = params as string[];
			const now = nextTime();
			const row: McqRow = {
				id,
				name,
				question,
				created_by_user_id,
				created_at: now,
				updated_at: now,
			};
			mcqs.push(row);
			return { results: [row] };
		}

		if (sql.includes("INSERT INTO mcq_choices")) {
			const [id, mcq_id, label, is_correct, position] = params as [
				string,
				string,
				string,
				number,
				number,
			];
			const row: ChoiceRow = {
				id,
				mcq_id,
				label,
				is_correct: Number(is_correct),
				position,
			};
			choices.push(row);
			return { results: [row] };
		}

		if (sql.includes("UPDATE mcqs")) {
			const [name, question, id] = params as string[];
			const row = mcqs.find((mcq) => mcq.id === id);
			if (!row) {
				return { results: [] };
			}
			row.name = name;
			row.question = question;
			row.updated_at = nextTime();
			return { results: [row] };
		}

		if (sql.includes("UPDATE mcq_choices")) {
			const [label, is_correct, position, id, mcq_id] = params as [
				string,
				number,
				number,
				string,
				string,
			];
			const row = choices.find((choice) => choice.id === id && choice.mcq_id === mcq_id);
			if (!row) {
				return { results: [] };
			}
			row.label = label;
			row.is_correct = Number(is_correct);
			row.position = position;
			return { results: [row] };
		}

		if (sql.includes("DELETE FROM mcq_choices")) {
			const [id] = params as string[];
			const index = choices.findIndex((choice) => choice.id === id);
			if (index >= 0) {
				choices.splice(index, 1);
			}
			return { results: [] };
		}

		if (sql.includes("DELETE FROM mcqs")) {
			const [id] = params as string[];
			const index = mcqs.findIndex((mcq) => mcq.id === id);
			if (index >= 0) {
				const [removed] = mcqs.splice(index, 1);
				for (let i = choices.length - 1; i >= 0; i -= 1) {
					if (choices[i]?.mcq_id === removed?.id) {
						choices.splice(i, 1);
					}
				}
				return { results: removed ? [removed] : [] };
			}
			return { results: [] };
		}

		if (sql.includes("FROM mcq_choices") && sql.includes("mcq_id")) {
			const [mcq_id] = params as string[];
			return {
				results: choices
					.filter((choice) => choice.mcq_id === mcq_id)
					.sort((a, b) => a.position - b.position),
			};
		}

		if (sql.includes("FROM mcqs") && sql.includes("WHERE id")) {
			const [id] = params as string[];
			return { results: mcqs.filter((mcq) => mcq.id === id) };
		}

		if (sql.includes("FROM mcqs")) {
			return {
				results: [...mcqs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
			};
		}

		return { results: [] };
	}

	const mockDb = {
		prepare(sql: string) {
			function bound(params: unknown[]) {
				return {
					sql,
					params,
					async all() {
						return exec(sql, params);
					},
					async run() {
						exec(sql, params);
						return { success: true };
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
		async batch(
			statements: Array<{ sql: string; params: unknown[]; all: () => Promise<{ results: unknown[] }> }>,
		) {
			const results = [];
			for (const statement of statements) {
				results.push(await statement.all());
			}
			return results;
		},
	};

	return {
		mockDb,
		resetDb() {
			users.length = 0;
			mcqs.length = 0;
			choices.length = 0;
			clock = 0;
		},
		seedUser(id = "user-ada") {
			users.push({ id });
			return id;
		},
	};
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(async () => mockDb),
}));

import {
	create,
	deleteMcq,
	findById,
	list,
	McqNotFoundError,
	McqValidationError,
	update,
} from "./mcq-service";

const creatorId = "user-ada";

function validMcq() {
	return {
		name: "Photosynthesis",
		question: "Which gas do plants absorb?",
		createdByUserId: creatorId,
		choices: [
			{ label: "Oxygen", isCorrect: false },
			{ label: "Carbon dioxide", isCorrect: true },
		],
	};
}

describe("mcq service", () => {
	beforeEach(() => {
		resetDb();
		seedUser(creatorId);
		vi.clearAllMocks();
	});

	it("create persists name, question, and createdByUserId and returns an id", async () => {
		const created = await create(validMcq());

		expect(created.id).toEqual(expect.any(String));
		expect(created.name).toBe("Photosynthesis");
		expect(created.question).toBe("Which gas do plants absorb?");
		expect(created.createdByUserId).toBe(creatorId);
	});

	it("create with two choices stores both, assigns position 1 and 2 from array order, and returns them", async () => {
		const created = await create(validMcq());

		expect(created.choices).toHaveLength(2);
		expect(created.choices[0]).toMatchObject({
			label: "Oxygen",
			isCorrect: false,
			position: 1,
		});
		expect(created.choices[1]).toMatchObject({
			label: "Carbon dioxide",
			isCorrect: true,
			position: 2,
		});
		expect(created.choices[0]).not.toHaveProperty("is_correct");
	});

	it("create with fewer than 2 choices is rejected", async () => {
		await expect(
			create({
				...validMcq(),
				choices: [{ label: "Only one", isCorrect: true }],
			}),
		).rejects.toBeInstanceOf(McqValidationError);
	});

	it("create with more than 6 choices is rejected", async () => {
		await expect(
			create({
				...validMcq(),
				choices: [
					{ label: "A", isCorrect: true },
					{ label: "B", isCorrect: false },
					{ label: "C", isCorrect: false },
					{ label: "D", isCorrect: false },
					{ label: "E", isCorrect: false },
					{ label: "F", isCorrect: false },
					{ label: "G", isCorrect: false },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);
	});

	it("create with zero or more than one isCorrect true is rejected", async () => {
		await expect(
			create({
				...validMcq(),
				choices: [
					{ label: "Oxygen", isCorrect: false },
					{ label: "Carbon dioxide", isCorrect: false },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);

		await expect(
			create({
				...validMcq(),
				choices: [
					{ label: "Oxygen", isCorrect: true },
					{ label: "Carbon dioxide", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);
	});

	it("create with an empty name, empty question, or empty choice label is rejected", async () => {
		await expect(create({ ...validMcq(), name: "   " })).rejects.toBeInstanceOf(McqValidationError);
		await expect(create({ ...validMcq(), question: "" })).rejects.toBeInstanceOf(McqValidationError);
		await expect(
			create({
				...validMcq(),
				choices: [
					{ label: "   ", isCorrect: false },
					{ label: "Carbon dioxide", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);
	});

	it("create without createdByUserId or with an unknown user id is rejected", async () => {
		await expect(create({ ...validMcq(), createdByUserId: "" })).rejects.toBeInstanceOf(
			McqValidationError,
		);
		await expect(create({ ...validMcq(), createdByUserId: "missing-user" })).rejects.toBeInstanceOf(
			McqValidationError,
		);
	});

	it("list returns questions newest first", async () => {
		const first = await create({ ...validMcq(), name: "Older" });
		const second = await create({ ...validMcq(), name: "Newer" });

		const listed = await list();

		expect(listed.map((item) => item.name)).toEqual(["Newer", "Older"]);
		expect(listed[0]?.id).toBe(second.id);
		expect(listed[1]?.id).toBe(first.id);
		expect(listed[0]).not.toHaveProperty("choices");
	});

	it("findById returns the MCQ including question, createdByUserId, and choices ordered by position", async () => {
		const created = await create({
			...validMcq(),
			choices: [
				{ label: "Second", isCorrect: false },
				{ label: "First is actually second in payload but we rely on assigned position", isCorrect: true },
			],
		});

		const found = await findById(created.id);

		expect(found?.question).toBe("Which gas do plants absorb?");
		expect(found?.createdByUserId).toBe(creatorId);
		expect(found?.choices.map((choice) => choice.position)).toEqual([1, 2]);
		expect(found?.choices[0]?.label).toBe("Second");
		expect(found?.choices[1]?.isCorrect).toBe(true);
	});

	it("findById returns null when no row exists", async () => {
		await expect(findById("missing-mcq")).resolves.toBeNull();
	});

	it("update changes name and question and updates existing choices by id; createdByUserId is unchanged", async () => {
		const created = await create(validMcq());

		const updated = await update(created.id, {
			name: "Plant gases",
			question: "What do plants take in?",
			choices: [
				{ id: created.choices[0]?.id, label: "Nitrogen", isCorrect: false },
				{ id: created.choices[1]?.id, label: "Carbon dioxide", isCorrect: true },
			],
		});

		expect(updated.name).toBe("Plant gases");
		expect(updated.question).toBe("What do plants take in?");
		expect(updated.createdByUserId).toBe(creatorId);
		expect(updated.choices[0]?.id).toBe(created.choices[0]?.id);
		expect(updated.choices[0]?.label).toBe("Nitrogen");
	});

	it("update inserts choices that have no id and deletes choices omitted from the payload", async () => {
		const created = await create(validMcq());
		const keptId = created.choices[1]?.id;

		const updated = await update(created.id, {
			name: created.name,
			question: created.question,
			choices: [
				{ id: keptId, label: "Carbon dioxide", isCorrect: true },
				{ label: "Water vapor", isCorrect: false },
			],
		});

		expect(updated.choices).toHaveLength(2);
		expect(updated.choices.map((choice) => choice.label)).toEqual(["Carbon dioxide", "Water vapor"]);
		expect(updated.choices[0]?.id).toBe(keptId);
		expect(updated.choices[1]?.id).not.toBe(created.choices[0]?.id);
		expect(updated.choices.some((choice) => choice.label === "Oxygen")).toBe(false);
	});

	it("deleteMcq removes the question so findById afterward is null", async () => {
		const created = await create(validMcq());

		await deleteMcq(created.id);

		await expect(findById(created.id)).resolves.toBeNull();
	});
});
