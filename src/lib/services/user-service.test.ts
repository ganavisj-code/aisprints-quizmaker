import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password: string;
};

const { mockDb, resetUsers } = vi.hoisted(() => {
	const users: UserRow[] = [];

	function throwIfDuplicate(username: string, email: string, exceptId?: string) {
		const conflict = users.find(
			(user) =>
				user.id !== exceptId && (user.username === username || user.email === email),
		);
		if (conflict) {
			throw new Error("UNIQUE constraint failed: users.username");
		}
	}

	const mockDb = {
		prepare(sql: string) {
			return {
				bind(...params: unknown[]) {
					return {
						async all() {
							if (sql.includes("INSERT")) {
								const [first_name, last_name, username, email, password] =
									params as string[];
								throwIfDuplicate(username, email);
								const row: UserRow = {
									id: crypto.randomUUID(),
									first_name,
									last_name,
									username,
									email,
									password,
								};
								users.push(row);
								return { results: [row] };
							}

							if (sql.includes("UPDATE")) {
								const [first_name, last_name, username, email, password, id] =
									params as Array<string | null>;
								const row = users.find((user) => user.id === id);
								if (!row) {
									return { results: [] };
								}
								const nextUsername = username ?? row.username;
								const nextEmail = email ?? row.email;
								throwIfDuplicate(nextUsername, nextEmail, row.id);
								row.first_name = first_name ?? row.first_name;
								row.last_name = last_name ?? row.last_name;
								row.username = nextUsername;
								row.email = nextEmail;
								row.password = password ?? row.password;
								return { results: [row] };
							}

							if (sql.includes("username")) {
								const [username] = params as string[];
								return { results: users.filter((user) => user.username === username) };
							}

							if (sql.includes("id")) {
								const [id] = params as string[];
								return { results: users.filter((user) => user.id === id) };
							}

							return { results: [] };
						},
						async run() {
							if (sql.includes("DELETE")) {
								const [id] = params as string[];
								const index = users.findIndex((user) => user.id === id);
								if (index >= 0) {
									users.splice(index, 1);
								}
							}
							return { success: true };
						},
					};
				},
			};
		},
	};

	return {
		mockDb,
		resetUsers() {
			users.length = 0;
		},
	};
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(async () => mockDb),
}));

import {
	create,
	deleteUser,
	findByUsername,
	update,
	UserConflictError,
} from "./user-service";

const plaintextPassword = "teacher-password";
const passwordHash = "hashed-teacher-password";

function ada() {
	return {
		firstName: "Ada",
		lastName: "Lovelace",
		username: "ada@school.edu",
		email: "ada@school.edu",
		passwordHash,
	};
}

describe("user service", () => {
	beforeEach(() => {
		resetUsers();
		vi.clearAllMocks();
	});

	it("create persists first name, last name, username, and email", async () => {
		const created = await create(ada());

		expect(created.firstName).toBe("Ada");
		expect(created.lastName).toBe("Lovelace");
		expect(created.username).toBe("ada@school.edu");
		expect(created.email).toBe("ada@school.edu");
		expect(created.id).toEqual(expect.any(String));
	});

	it("create writes a password hash, not the plaintext the teacher typed", async () => {
		await create(ada());

		const stored = await findByUsername("ada@school.edu");
		expect(stored).not.toBeNull();
		expect(stored?.passwordHash).toBe(passwordHash);
		expect(stored?.passwordHash).not.toBe(plaintextPassword);
	});

	it("create allows username and email to be the same string", async () => {
		const created = await create(ada());

		expect(created.username).toBe(created.email);
	});

	it("create returns a public user with no password field", async () => {
		const created = await create(ada());

		expect(created).not.toHaveProperty("password");
		expect(created).not.toHaveProperty("passwordHash");
	});

	it("findByUsername returns the stored hash so login can compare", async () => {
		await create(ada());

		const found = await findByUsername("ada@school.edu");
		expect(found?.passwordHash).toBe(passwordHash);
	});

	it("findByUsername returns null when no row exists", async () => {
		await expect(findByUsername("missing@school.edu")).resolves.toBeNull();
	});

	it("update changes the requested fields and still omits password from the public result", async () => {
		const created = await create(ada());

		const updated = await update(created.id, { lastName: "Byron" });

		expect(updated.lastName).toBe("Byron");
		expect(updated.firstName).toBe("Ada");
		expect(updated).not.toHaveProperty("password");
		expect(updated).not.toHaveProperty("passwordHash");
	});

	it("delete removes the user so findByUsername afterward is null", async () => {
		const created = await create(ada());

		await deleteUser(created.id);

		await expect(findByUsername("ada@school.edu")).resolves.toBeNull();
	});

	it("duplicate username or email surfaces a conflict the endpoints can map to 409", async () => {
		await create(ada());

		await expect(
			create({
				firstName: "Ada",
				lastName: "Clone",
				username: "ada@school.edu",
				email: "other@school.edu",
				passwordHash,
			}),
		).rejects.toBeInstanceOf(UserConflictError);

		await expect(
			create({
				firstName: "Other",
				lastName: "Teacher",
				username: "other@school.edu",
				email: "ada@school.edu",
				passwordHash,
			}),
		).rejects.toBeInstanceOf(UserConflictError);
	});
});
