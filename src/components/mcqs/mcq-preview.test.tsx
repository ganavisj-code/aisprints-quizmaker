import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

import { McqPreview } from "./mcq-preview";

const photosynthesis = {
	id: "mcq-1",
	name: "Photosynthesis",
	question: "Which gas do plants absorb?",
	createdByUserId: "user-ada",
	createdAt: "2026-09-02T00:00:00.001Z",
	updatedAt: "2026-09-02T00:00:00.001Z",
	choices: [
		{ id: "c1", label: "Oxygen", isCorrect: false, position: 1 },
		{ id: "c2", label: "Carbon dioxide", isCorrect: true, position: 2 },
	],
};

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function mockPreviewFetch(attempt?: { isCorrect: boolean }) {
	vi.mocked(fetch).mockImplementation(async (input, init) => {
		const url = String(input);
		const method = init?.method ?? "GET";

		if (url === "/api/mcqs/mcq-1" && method === "GET") {
			return jsonResponse(photosynthesis);
		}

		if (url === "/api/mcqs/mcq-1/attempts" && method === "POST") {
			const body = JSON.parse(String(init?.body)) as { choiceId?: string };
			return jsonResponse(
				{
					id: "attempt-1",
					mcqId: "mcq-1",
					choiceId: body.choiceId,
					isCorrect: attempt?.isCorrect ?? false,
				},
				201,
			);
		}

		return jsonResponse({ error: "unhandled" }, 500);
	});
}

describe("McqPreview", () => {
	beforeEach(() => {
		push.mockReset();
		vi.stubGlobal("fetch", vi.fn());
		mockPreviewFetch();
	});

	it("renders name, question, and choice labels without revealing the correct answer", async () => {
		render(<McqPreview mcqId="mcq-1" />);

		expect(await screen.findByText("Photosynthesis")).toBeTruthy();
		expect(screen.getByText("Which gas do plants absorb?")).toBeTruthy();
		expect(screen.getByRole("radio", { name: /^oxygen$/i })).toBeTruthy();
		expect(screen.getByRole("radio", { name: /^carbon dioxide$/i })).toBeTruthy();
		expect(screen.queryByRole("status")).toBeNull();
		expect(fetch).toHaveBeenCalledWith("/api/mcqs/mcq-1");
	});

	it("does not POST an attempt when no choice is selected", async () => {
		const user = userEvent.setup();
		render(<McqPreview mcqId="mcq-1" />);

		await screen.findByText("Photosynthesis");
		await user.click(screen.getByRole("button", { name: /^submit$/i }));

		const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
		expect(posts).toHaveLength(0);
	});

	it("POSTs /api/mcqs/[id]/attempts with the selected choiceId", async () => {
		const user = userEvent.setup();
		render(<McqPreview mcqId="mcq-1" />);

		await user.click(await screen.findByRole("radio", { name: /^oxygen$/i }));
		await user.click(screen.getByRole("button", { name: /^submit$/i }));

		await waitFor(() => {
			const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
			expect(post?.[0]).toBe("/api/mcqs/mcq-1/attempts");
			expect(JSON.parse(String(post?.[1]?.body))).toEqual({ choiceId: "c1" });
		});
	});

	it("shows that the answer was correct when the attempt returns isCorrect true", async () => {
		const user = userEvent.setup();
		mockPreviewFetch({ isCorrect: true });
		render(<McqPreview mcqId="mcq-1" />);

		await user.click(await screen.findByRole("radio", { name: /^carbon dioxide$/i }));
		await user.click(screen.getByRole("button", { name: /^submit$/i }));

		const status = await screen.findByRole("status");
		expect(status.textContent).toMatch(/correct/i);
		expect(status.textContent).not.toMatch(/incorrect/i);
	});

	it("shows that the answer was incorrect when the attempt returns isCorrect false", async () => {
		const user = userEvent.setup();
		mockPreviewFetch({ isCorrect: false });
		render(<McqPreview mcqId="mcq-1" />);

		await user.click(await screen.findByRole("radio", { name: /^oxygen$/i }));
		await user.click(screen.getByRole("button", { name: /^submit$/i }));

		expect((await screen.findByRole("status")).textContent).toMatch(/incorrect/i);
	});
});
