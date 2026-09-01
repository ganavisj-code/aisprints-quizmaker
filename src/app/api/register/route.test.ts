import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserConflictError } from "@/lib/services/user-service";

const { create } = vi.hoisted(() => ({
	create: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		create,
	};
});

import { POST } from "./route";

const validBody = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada@school.edu",
	email: "ada@school.edu",
	password: "hashed-teacher-password",
};

const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada@school.edu",
	email: "ada@school.edu",
};

function postRegister(body: unknown) {
	return POST(
		new Request("http://localhost/api/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 and a public user with no password", async () => {
		create.mockResolvedValue(publicUser);

		const response = await postRegister(validBody);
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toEqual(publicUser);
		expect(body).not.toHaveProperty("password");
		expect(body).not.toHaveProperty("passwordHash");
		expect(create).toHaveBeenCalledWith({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada@school.edu",
			email: "ada@school.edu",
			passwordHash: "hashed-teacher-password",
		});
	});

	it("returns 400 when fields are missing or invalid", async () => {
		const response = await postRegister({
			firstName: "Ada",
			email: "not-an-email",
		});

		expect(response.status).toBe(400);
		expect(create).not.toHaveBeenCalled();
	});

	it("returns 409 when username or email already exists", async () => {
		create.mockRejectedValue(new UserConflictError());

		const response = await postRegister(validBody);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body).toEqual({ error: "Username or email already exists" });
	});

	it("does not include a token or Set-Cookie header on success", async () => {
		create.mockResolvedValue(publicUser);

		const response = await postRegister(validBody);
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).not.toHaveProperty("token");
		expect(response.headers.get("set-cookie")).toBeNull();
	});
});
