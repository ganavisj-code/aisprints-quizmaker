import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqNotFoundError } from "@/lib/services/mcq-service";

const { createAttempt } = vi.hoisted(() => ({
	createAttempt: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/attempt-service", () => ({
	createAttempt,
}));

import { POST } from "./route";

const mcqId = "mcq-1";
const choiceId = "choice-2";

function context(id: string) {
	return { params: Promise.resolve({ id }) };
}

function postAttempt(id: string, body: unknown) {
	return POST(
		new Request(`http://localhost/api/mcqs/${id}/attempts`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
		context(id),
	);
}

describe("POST /api/mcqs/[id]/attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 with id, mcqId, choiceId, and isCorrect for a valid choiceId", async () => {
		createAttempt.mockResolvedValue({
			id: "attempt-1",
			mcqId,
			choiceId,
			isCorrect: true,
		});

		const response = await postAttempt(mcqId, { choiceId });
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toEqual({
			id: "attempt-1",
			mcqId,
			choiceId,
			isCorrect: true,
		});
		expect(createAttempt).toHaveBeenCalledWith(mcqId, choiceId);
	});

	it("returns 404 when the choice does not belong to the MCQ", async () => {
		createAttempt.mockRejectedValue(new McqNotFoundError());

		const response = await postAttempt(mcqId, { choiceId: "foreign-choice" });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toEqual({ error: "MCQ not found" });
	});

	it("returns 400 when the body is missing choiceId", async () => {
		const response = await postAttempt(mcqId, {});

		expect(response.status).toBe(400);
		expect(createAttempt).not.toHaveBeenCalled();
	});
});
