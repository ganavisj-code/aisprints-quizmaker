import "server-only";

import { getDb } from "@/lib/db";

export class UserConflictError extends Error {
	constructor(message = "Username or email already exists") {
		super(message);
		this.name = "UserConflictError";
	}
}

export type NewUser = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
};

export type PublicUser = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

export type UserRecord = PublicUser & {
	passwordHash: string;
};

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password: string;
};

function isUniqueConstraintError(error: unknown) {
	return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
	};
}

function toUserRecord(row: UserRow): UserRecord {
	return {
		...toPublicUser(row),
		passwordHash: row.password,
	};
}

export async function create(user: NewUser): Promise<PublicUser> {
	const db = await getDb();

	try {
		const { results } = await db
			.prepare(
				`INSERT INTO users (first_name, last_name, username, email, password)
				 VALUES (?1, ?2, ?3, ?4, ?5)
				 RETURNING id, first_name, last_name, username, email, password`,
			)
			.bind(user.firstName, user.lastName, user.username, user.email, user.passwordHash)
			.all<UserRow>();

		const row = results[0];
		if (!row) {
			throw new Error("Failed to create user");
		}

		return toPublicUser(row);
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new UserConflictError();
		}
		throw error;
	}
}

export async function findByUsername(username: string): Promise<UserRecord | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password
			 FROM users
			 WHERE username = ?1`,
		)
		.bind(username)
		.all<UserRow>();

	const row = results[0];
	return row ? toUserRecord(row) : null;
}

export async function findById(id: string): Promise<UserRecord | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password
			 FROM users
			 WHERE id = ?1`,
		)
		.bind(id)
		.all<UserRow>();

	const row = results[0];
	return row ? toUserRecord(row) : null;
}

export async function update(
	id: string,
	patch: Partial<NewUser>,
): Promise<PublicUser> {
	const db = await getDb();

	try {
		const { results } = await db
			.prepare(
				`UPDATE users
				 SET first_name = COALESCE(?1, first_name),
				     last_name = COALESCE(?2, last_name),
				     username = COALESCE(?3, username),
				     email = COALESCE(?4, email),
				     password = COALESCE(?5, password),
				     updated_at = CURRENT_TIMESTAMP
				 WHERE id = ?6
				 RETURNING id, first_name, last_name, username, email, password`,
			)
			.bind(
				patch.firstName ?? null,
				patch.lastName ?? null,
				patch.username ?? null,
				patch.email ?? null,
				patch.passwordHash ?? null,
				id,
			)
			.all<UserRow>();

		const row = results[0];
		if (!row) {
			throw new Error("User not found");
		}

		return toPublicUser(row);
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new UserConflictError();
		}
		throw error;
	}
}

export async function deleteUser(id: string): Promise<void> {
	const db = await getDb();
	await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
}
