import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

import { McqForm } from "./mcq-form";

const USER_ID = "user-ada";

const photosynthesis = {
	id: "mcq-1",
	name: "Photosynthesis",
	question: "Which gas do plants absorb?",
	createdByUserId: USER_ID,
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

function choiceInputs() {
	return screen.getAllByRole("textbox", { name: /choice \d+/i });
}

async function fillValidCreate(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByRole("textbox", { name: /^name$/i }), "Photosynthesis");
	await user.type(
		screen.getByRole("textbox", { name: /^question$/i }),
		"Which gas do plants absorb?",
	);
	await user.type(choiceInputs()[0], "Oxygen");
	await user.type(choiceInputs()[1], "Carbon dioxide");
	await user.click(screen.getByRole("radio", { name: /mark choice 2 as correct/i }));
}

describe("McqForm", () => {
	beforeEach(() => {
		push.mockReset();
		vi.stubGlobal("fetch", vi.fn());
		sessionStorage.clear();
		sessionStorage.setItem("userId", USER_ID);
	});

	it("renders name, question, and two choice inputs on create", () => {
		render(<McqForm />);

		expect(screen.getByRole("textbox", { name: /^name$/i })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: /^question$/i })).toBeTruthy();
		expect(choiceInputs()).toHaveLength(2);
	});

	it("adds a third choice and does not add a seventh after six", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.click(screen.getByRole("button", { name: /add choice/i }));
		expect(choiceInputs()).toHaveLength(3);

		for (let i = 0; i < 4; i += 1) {
			await user.click(screen.getByRole("button", { name: /add choice/i }));
		}

		expect(choiceInputs()).toHaveLength(6);
		expect(screen.getByRole("button", { name: /add choice/i })).toHaveProperty("disabled", true);

		await user.click(screen.getByRole("button", { name: /add choice/i }));
		expect(choiceInputs()).toHaveLength(6);
	});

	it("does not remove a choice when only two remain", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		const removeButtons = screen.getAllByRole("button", { name: /remove choice/i });
		expect(removeButtons).toHaveLength(2);
		expect(removeButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

		await user.click(removeButtons[0]);
		expect(choiceInputs()).toHaveLength(2);
	});

	it("does not fetch when name or question is empty", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.type(
			screen.getByRole("textbox", { name: /^question$/i }),
			"Which gas do plants absorb?",
		);
		await user.type(choiceInputs()[0], "Oxygen");
		await user.type(choiceInputs()[1], "Carbon dioxide");
		await user.click(screen.getByRole("radio", { name: /mark choice 2 as correct/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(fetch).not.toHaveBeenCalled();

		await user.type(screen.getByRole("textbox", { name: /^name$/i }), "Photosynthesis");
		await user.clear(screen.getByRole("textbox", { name: /^question$/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(fetch).not.toHaveBeenCalled();
	});

	it("does not fetch when no correct choice is marked", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.type(screen.getByRole("textbox", { name: /^name$/i }), "Photosynthesis");
		await user.type(
			screen.getByRole("textbox", { name: /^question$/i }),
			"Which gas do plants absorb?",
		);
		await user.type(choiceInputs()[0], "Oxygen");
		await user.type(choiceInputs()[1], "Carbon dioxide");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(fetch).not.toHaveBeenCalled();
	});

	it("POSTs a valid create payload with createdByUserId and navigates to /mcqs", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "mcq-1" }, 201));
		render(<McqForm />);

		await fillValidCreate(user);
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalled();
			expect(push).toHaveBeenCalledWith("/mcqs");
		});

		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe("/api/mcqs");
		expect(init?.method).toBe("POST");
		const body = JSON.parse(String(init?.body)) as {
			name: string;
			question: string;
			createdByUserId: string;
			choices: { label: string; isCorrect: boolean }[];
		};
		expect(body).toEqual({
			name: "Photosynthesis",
			question: "Which gas do plants absorb?",
			createdByUserId: USER_ID,
			choices: [
				{ label: "Oxygen", isCorrect: false },
				{ label: "Carbon dioxide", isCorrect: true },
			],
		});
	});

	it("navigates to /mcqs on cancel without fetch", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.click(screen.getByRole("button", { name: /^cancel$/i }));

		expect(push).toHaveBeenCalledWith("/mcqs");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("loads GET /api/mcqs/[id] and fills name, question, and choice labels", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(photosynthesis));
		render(<McqForm mcqId="mcq-1" />);

		await waitFor(() => {
			expect(
				(screen.getByRole("textbox", { name: /^name$/i }) as HTMLInputElement).value,
			).toBe("Photosynthesis");
			expect(
				(screen.getByRole("textbox", { name: /^question$/i }) as HTMLTextAreaElement).value,
			).toBe("Which gas do plants absorb?");
			expect((choiceInputs()[0] as HTMLInputElement).value).toBe("Oxygen");
			expect((choiceInputs()[1] as HTMLInputElement).value).toBe("Carbon dioxide");
		});

		expect(fetch).toHaveBeenCalledWith("/api/mcqs/mcq-1");
	});

	it("PUTs the edit payload without createdByUserId and navigates to /mcqs", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (url === "/api/mcqs/mcq-1" && method === "GET") {
				return jsonResponse(photosynthesis);
			}
			if (url === "/api/mcqs/mcq-1" && method === "PUT") {
				return jsonResponse(photosynthesis);
			}
			return jsonResponse({ error: "unhandled" }, 500);
		});
		render(<McqForm mcqId="mcq-1" />);

		await screen.findByDisplayValue("Photosynthesis");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(push).toHaveBeenCalledWith("/mcqs");
		});

		const putCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PUT");
		expect(putCall?.[0]).toBe("/api/mcqs/mcq-1");
		const body = JSON.parse(String(putCall?.[1]?.body)) as Record<string, unknown>;
		expect(body).not.toHaveProperty("createdByUserId");
		expect(body).toEqual({
			name: "Photosynthesis",
			question: "Which gas do plants absorb?",
			choices: [
				{ id: "c1", label: "Oxygen", isCorrect: false },
				{ id: "c2", label: "Carbon dioxide", isCorrect: true },
			],
		});
	});

	it("shows an error and does not navigate when save returns 400", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "Validation failed" }, 400));
		render(<McqForm />);

		await fillValidCreate(user);
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toMatch(/validation failed/i);
		expect(push).not.toHaveBeenCalled();
	});
});
