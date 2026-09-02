import { beforeEach, describe, expect, it, vi } from "vitest";

const { list, create } = vi.hoisted(() => ({
	list: vi.fn(),
	create: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		list,
		create,
	};
});

import { GET, POST } from "@/app/api/mcqs/route";

const listItem = {
	id: "mcq-1",
	name: "Photosynthesis",
	question: "Which gas do plants absorb?",
	createdByUserId: "user-ada",
	createdAt: "2026-09-02T00:00:00.001Z",
	updatedAt: "2026-09-02T00:00:00.001Z",
};

const createdMcq = {
	...listItem,
	choices: [
		{ id: "choice-1", label: "Oxygen", isCorrect: false, position: 1 },
		{ id: "choice-2", label: "Carbon dioxide", isCorrect: true, position: 2 },
	],
};

const validBody = {
	name: "Photosynthesis",
	question: "Which gas do plants absorb?",
	createdByUserId: "user-ada",
	choices: [
		{ label: "Oxygen", isCorrect: false },
		{ label: "Carbon dioxide", isCorrect: true },
	],
};

function getMcqs() {
	return GET(new Request("http://localhost/api/mcqs", { method: "GET" }));
}

function postMcqs(body: unknown) {
	return POST(
		new Request("http://localhost/api/mcqs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("/api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("GET returns 200 and a list payload", async () => {
		list.mockResolvedValue([listItem]);

		const response = await getMcqs();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ mcqs: [listItem] });
		expect(list).toHaveBeenCalledOnce();
	});

	it("POST with a valid body returns 201 and the created MCQ with choices", async () => {
		create.mockResolvedValue(createdMcq);

		const response = await postMcqs(validBody);
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toEqual(createdMcq);
		expect(create).toHaveBeenCalledWith(validBody);
	});

	it("POST with an invalid body returns 400", async () => {
		const invalidBodies = [
			{ ...validBody, choices: [{ label: "Only one", isCorrect: true }] },
			{
				...validBody,
				choices: [
					{ label: "Oxygen", isCorrect: true },
					{ label: "Carbon dioxide", isCorrect: true },
				],
			},
			{ ...validBody, name: "" },
			{ ...validBody, question: "" },
			{ ...validBody, createdByUserId: undefined },
		];

		for (const invalidBody of invalidBodies) {
			create.mockClear();
			const response = await postMcqs(invalidBody);
			expect(response.status, JSON.stringify(invalidBody)).toBe(400);
			expect(create).not.toHaveBeenCalled();
		}
	});
});
