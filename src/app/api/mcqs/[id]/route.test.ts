import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqNotFoundError } from "@/lib/services/mcq-service";

const { findById, update, deleteMcq } = vi.hoisted(() => ({
	findById: vi.fn(),
	update: vi.fn(),
	deleteMcq: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		findById,
		update,
		deleteMcq,
	};
});

import { DELETE, GET, PUT } from "./route";

const mcqId = "mcq-1";

const existingMcq = {
	id: mcqId,
	name: "Photosynthesis",
	question: "Which gas do plants absorb?",
	createdByUserId: "user-ada",
	createdAt: "2026-09-02T00:00:00.001Z",
	updatedAt: "2026-09-02T00:00:00.001Z",
	choices: [
		{ id: "choice-1", label: "Oxygen", isCorrect: false, position: 1 },
		{ id: "choice-2", label: "Carbon dioxide", isCorrect: true, position: 2 },
	],
};

const updateBody = {
	name: "Plant gases",
	question: "What do plants take in?",
	choices: [
		{ id: "choice-1", label: "Nitrogen", isCorrect: false },
		{ id: "choice-2", label: "Carbon dioxide", isCorrect: true },
	],
};

function context(id: string) {
	return { params: Promise.resolve({ id }) };
}

function getMcq(id: string) {
	return GET(new Request(`http://localhost/api/mcqs/${id}`, { method: "GET" }), context(id));
}

function putMcq(id: string, body: unknown) {
	return PUT(
		new Request(`http://localhost/api/mcqs/${id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		context(id),
	);
}

function deleteMcqRequest(id: string) {
	return DELETE(new Request(`http://localhost/api/mcqs/${id}`, { method: "DELETE" }), context(id));
}

describe("/api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("GET returns 200 with choices when the row exists", async () => {
		findById.mockResolvedValue(existingMcq);

		const response = await getMcq(mcqId);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual(existingMcq);
		expect(findById).toHaveBeenCalledWith(mcqId);
	});

	it("GET returns 404 when the row does not exist", async () => {
		findById.mockResolvedValue(null);

		const response = await getMcq("missing");
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toEqual({ error: "MCQ not found" });
	});

	it("PUT returns 200 with the updated question", async () => {
		const updated = { ...existingMcq, name: "Plant gases", question: "What do plants take in?" };
		update.mockResolvedValue(updated);

		const response = await putMcq(mcqId, updateBody);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual(updated);
		expect(update).toHaveBeenCalledWith(mcqId, updateBody);
	});

	it("PUT returns 404 for an unknown id", async () => {
		update.mockRejectedValue(new McqNotFoundError());

		const response = await putMcq("missing", updateBody);
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toEqual({ error: "MCQ not found" });
	});

	it("DELETE returns 204", async () => {
		deleteMcq.mockResolvedValue(undefined);

		const response = await deleteMcqRequest(mcqId);

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(deleteMcq).toHaveBeenCalledWith(mcqId);
	});

	it("DELETE returns 404 for an unknown id", async () => {
		deleteMcq.mockRejectedValue(new McqNotFoundError());

		const response = await deleteMcqRequest("missing");
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toEqual({ error: "MCQ not found" });
	});
});
