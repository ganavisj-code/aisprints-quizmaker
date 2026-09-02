import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

import { McqList } from "./mcq-list";

const photosynthesis = {
	id: "mcq-1",
	name: "Photosynthesis",
	question: "Which gas do plants absorb?",
	createdByUserId: "user-ada",
	createdAt: "2026-09-02T00:00:00.001Z",
	updatedAt: "2026-09-02T00:00:00.001Z",
};

const gravity = {
	id: "mcq-2",
	name: "Gravity",
	question: "What pulls objects down?",
	createdByUserId: "user-ada",
	createdAt: "2026-09-02T00:00:00.002Z",
	updatedAt: "2026-09-02T00:00:00.002Z",
};

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function mockMcqList(mcqs: unknown[] = []) {
	vi.mocked(fetch).mockImplementation(async (input, init) => {
		const url = String(input);
		const method = init?.method ?? "GET";

		if (url === "/api/logout" && method === "POST") {
			return jsonResponse({ ok: true });
		}

		if (url === "/api/mcqs" && method === "GET") {
			return jsonResponse({ mcqs });
		}

		if (url.startsWith("/api/mcqs/") && method === "DELETE") {
			return new Response(null, { status: 204 });
		}

		return jsonResponse({ error: "unhandled" }, 500);
	});
}

function mockLayout() {
	Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
		configurable: true,
		value() {
			return {
				width: 120,
				height: 32,
				top: 0,
				left: 0,
				bottom: 32,
				right: 120,
				x: 0,
				y: 0,
				toJSON() {
					return {};
				},
			};
		},
	});
}

describe("McqList", () => {
	beforeEach(() => {
		push.mockReset();
		vi.stubGlobal("fetch", vi.fn());
		mockMcqList();
		mockLayout();
	});

	it("renders a Create question button that navigates to /mcqs/new", async () => {
		const user = userEvent.setup();
		render(<McqList />);

		await user.click(screen.getByRole("button", { name: /create question/i }));

		expect(push).toHaveBeenCalledWith("/mcqs/new");
	});

	it("renders a row for each question name and prompt after a successful GET /api/mcqs", async () => {
		mockMcqList([photosynthesis, gravity]);
		render(<McqList />);

		await waitFor(() => {
			expect(screen.getByText("Photosynthesis")).toBeTruthy();
			expect(screen.getByText("Which gas do plants absorb?")).toBeTruthy();
			expect(screen.getByText("Gravity")).toBeTruthy();
			expect(screen.getByText("What pulls objects down?")).toBeTruthy();
		});

		expect(fetch).toHaveBeenCalledWith("/api/mcqs");
	});

	it("shows the Create button and no data rows when the list is empty", async () => {
		render(<McqList />);

		expect(screen.getByRole("button", { name: /create question/i })).toBeTruthy();

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/mcqs");
		});

		expect(screen.queryByText("Photosynthesis")).toBeNull();
		expect(screen.queryByRole("button", { name: /actions for/i })).toBeNull();
	});

	it("gives the actions trigger an accessible name that includes the question name", async () => {
		mockMcqList([photosynthesis]);
		render(<McqList />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /actions for photosynthesis/i })).toBeTruthy();
		});
	});

	it("opens actions with Edit, Preview, and Delete", async () => {
		const user = userEvent.setup();
		mockMcqList([photosynthesis]);
		render(<McqList />);

		await user.click(await screen.findByRole("button", { name: /actions for photosynthesis/i }));

		expect(await screen.findByRole("menuitem", { name: /^edit$/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /^preview$/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /^delete$/i })).toBeTruthy();
	});

	it("navigates to the edit page from the actions menu", async () => {
		const user = userEvent.setup();
		mockMcqList([photosynthesis]);
		render(<McqList />);

		await user.click(await screen.findByRole("button", { name: /actions for photosynthesis/i }));
		await user.click(await screen.findByRole("menuitem", { name: /^edit$/i }));

		expect(push).toHaveBeenCalledWith("/mcqs/mcq-1/edit");
	});

	it("navigates to the preview page from the actions menu", async () => {
		const user = userEvent.setup();
		mockMcqList([photosynthesis]);
		render(<McqList />);

		await user.click(await screen.findByRole("button", { name: /actions for photosynthesis/i }));
		await user.click(await screen.findByRole("menuitem", { name: /^preview$/i }));

		expect(push).toHaveBeenCalledWith("/mcqs/mcq-1/preview");
	});

	it("opens a confirm dialog and DELETEs the question when confirmed", async () => {
		const user = userEvent.setup();
		mockMcqList([photosynthesis]);
		render(<McqList />);

		await user.click(await screen.findByRole("button", { name: /actions for photosynthesis/i }));
		await user.click(await screen.findByRole("menuitem", { name: /^delete$/i }));

		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByRole("heading", { name: /delete question/i })).toBeTruthy();

		await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/mcqs/mcq-1", { method: "DELETE" });
		});
	});

	it("calls POST /api/logout, clears the stored user id, and navigates to /login", async () => {
		const user = userEvent.setup();
		sessionStorage.setItem("userId", "user-ada");
		render(<McqList />);

		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/logout", { method: "POST" });
			expect(push).toHaveBeenCalledWith("/login");
		});
		expect(sessionStorage.getItem("userId")).toBeNull();
	});
});
