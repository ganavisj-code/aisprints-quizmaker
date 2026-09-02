import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/password";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
	beforeEach(() => {
		push.mockReset();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders username and password fields", () => {
		render(<LoginForm />);

		expect(screen.getByLabelText(/username/i)).toBeTruthy();
		expect(screen.getByLabelText(/password/i)).toBeTruthy();
	});

	it("sends a hashed password to /api/login, not the typed plaintext", async () => {
		const user = userEvent.setup();
		const plaintext = "teacher-password";
		const hashed = await hashPassword(plaintext);
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "user-1" }), { status: 200 }),
		);

		render(<LoginForm />);

		await user.type(screen.getByLabelText(/username/i), "ada@school.edu");
		await user.type(screen.getByLabelText(/password/i), plaintext);
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalled();
		});
		expect(fetch).toHaveBeenCalledWith(
			"/api/login",
			expect.objectContaining({
				method: "POST",
			}),
		);
		const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
		expect(body.password).toBe(hashed);
		expect(body.password).not.toBe(plaintext);
	});

	it("navigates to /mcqs on 200 and stores the user id", async () => {
		const user = userEvent.setup();
		sessionStorage.clear();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "user-1" }), { status: 200 }),
		);

		render(<LoginForm />);

		await user.type(screen.getByLabelText(/username/i), "ada@school.edu");
		await user.type(screen.getByLabelText(/password/i), "teacher-password");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => {
			expect(push).toHaveBeenCalledWith("/mcqs");
		});
		expect(sessionStorage.getItem("userId")).toBe("user-1");
	});

	it("shows Invalid username or password on 401 and does not navigate", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: "Invalid username or password" }), {
				status: 401,
			}),
		);

		render(<LoginForm />);

		await user.type(screen.getByLabelText(/username/i), "ada@school.edu");
		await user.type(screen.getByLabelText(/password/i), "wrong-password");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Invalid username or password",
		);
		expect(push).not.toHaveBeenCalled();
	});
});
