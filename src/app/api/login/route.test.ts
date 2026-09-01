import { beforeEach, describe, expect, it, vi } from "vitest";

const { findByUsername } = vi.hoisted(() => ({
	findByUsername: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		findByUsername,
	};
});

import { POST } from "./route";

const storedUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada@school.edu",
	email: "ada@school.edu",
	passwordHash: "hashed-teacher-password",
};

function postLogin(body: unknown) {
	return POST(
		new Request("http://localhost/api/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and a public user when the username and hash match", async () => {
		findByUsername.mockResolvedValue(storedUser);

		const response = await postLogin({
			username: "ada@school.edu",
			password: "hashed-teacher-password",
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			id: "user-1",
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada@school.edu",
			email: "ada@school.edu",
		});
		expect(body).not.toHaveProperty("password");
		expect(body).not.toHaveProperty("passwordHash");
	});

	it("returns 401 when the username is unknown", async () => {
		findByUsername.mockResolvedValue(null);

		const response = await postLogin({
			username: "missing@school.edu",
			password: "hashed-teacher-password",
		});
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body).toEqual({ error: "Invalid username or password" });
	});

	it("returns 401 with the same message when the hash does not match", async () => {
		findByUsername.mockResolvedValueOnce(null);
		const unknown = await postLogin({
			username: "missing@school.edu",
			password: "hashed-teacher-password",
		});

		findByUsername.mockResolvedValueOnce(storedUser);
		const wrongHash = await postLogin({
			username: "ada@school.edu",
			password: "different-hash",
		});

		const unknownBody = await unknown.json();
		const wrongHashBody = await wrongHash.json();

		expect(unknown.status).toBe(401);
		expect(wrongHash.status).toBe(401);
		expect(wrongHashBody).toEqual(unknownBody);
		expect(wrongHashBody).toEqual({ error: "Invalid username or password" });
	});

	it("returns 400 when the body is invalid", async () => {
		const response = await postLogin({ username: "" });

		expect(response.status).toBe(400);
		expect(findByUsername).not.toHaveBeenCalled();
	});

	it("does not include a token or Set-Cookie header on success", async () => {
		findByUsername.mockResolvedValue(storedUser);

		const response = await postLogin({
			username: "ada@school.edu",
			password: "hashed-teacher-password",
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).not.toHaveProperty("token");
		expect(response.headers.get("set-cookie")).toBeNull();
	});
});
