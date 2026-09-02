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

import { RegisterForm } from "./register-form";

async function fillRegister(
	user: ReturnType<typeof userEvent.setup>,
	password = "teacher-password",
	confirmPassword = password,
) {
	await user.type(screen.getByLabelText(/first name/i), "Ada");
	await user.type(screen.getByLabelText(/last name/i), "Lovelace");
	await user.type(screen.getByLabelText(/username/i), "ada@school.edu");
	await user.type(screen.getByLabelText(/email/i), "ada@school.edu");
	await user.type(screen.getByLabelText(/^password$/i), password);
	await user.type(screen.getByLabelText(/confirm password/i), confirmPassword);
}

describe("RegisterForm", () => {
	beforeEach(() => {
		push.mockReset();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders first name, last name, username, email, and password fields", () => {
		render(<RegisterForm />);

		expect(screen.getByLabelText(/first name/i)).toBeTruthy();
		expect(screen.getByLabelText(/last name/i)).toBeTruthy();
		expect(screen.getByLabelText(/username/i)).toBeTruthy();
		expect(screen.getByLabelText(/email/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
		expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
	});

	it("sends a hashed password to /api/register, not the typed plaintext", async () => {
		const user = userEvent.setup();
		const plaintext = "teacher-password";
		const hashed = await hashPassword(plaintext);
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "user-1" }), { status: 201 }),
		);

		render(<RegisterForm />);
		await fillRegister(user, plaintext);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalled();
		});
		expect(fetch).toHaveBeenCalledWith(
			"/api/register",
			expect.objectContaining({
				method: "POST",
			}),
		);
		const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
		expect(body.password).toBe(hashed);
		expect(body.password).not.toBe(plaintext);
	});

	it("navigates to /mcqs on 201 and stores the user id", async () => {
		const user = userEvent.setup();
		sessionStorage.clear();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "user-1" }), { status: 201 }),
		);

		render(<RegisterForm />);
		await fillRegister(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => {
			expect(push).toHaveBeenCalledWith("/mcqs");
		});
		expect(sessionStorage.getItem("userId")).toBe("user-1");
	});

	it("shows an error on 409 and does not navigate", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: "Username or email already exists" }), {
				status: 409,
			}),
		);

		render(<RegisterForm />);
		await fillRegister(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect((await screen.findByRole("alert")).textContent).toMatch(
			/username or email already exists/i,
		);
		expect(push).not.toHaveBeenCalled();
	});

	it("does not submit when the password confirmation does not match", async () => {
		const user = userEvent.setup();

		render(<RegisterForm />);
		await fillRegister(user, "teacher-password", "different-password");
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect((await screen.findByRole("alert")).textContent).toBe("Passwords do not match");
		expect(fetch).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});
});
