import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.resolve(process.cwd(), "migrations");

function readMigration0002(): string {
	const files = readdirSync(migrationsDir).filter((file) => /^0002_.*\.sql$/u.test(file));
	expect(files, "expected a migrations/0002_*.sql file").toHaveLength(1);
	return readFileSync(path.join(migrationsDir, files[0]), "utf8");
}

function tableBody(sql: string, tableName: string): string {
	const marker = `CREATE TABLE ${tableName} (`;
	const start = sql.indexOf(marker);
	expect(start, `expected ${marker}`).toBeGreaterThanOrEqual(0);

	const openParen = start + marker.length - 1;
	let depth = 0;
	for (let index = openParen; index < sql.length; index += 1) {
		if (sql[index] === "(") {
			depth += 1;
		} else if (sql[index] === ")") {
			depth -= 1;
			if (depth === 0) {
				return sql.slice(openParen + 1, index);
			}
		}
	}

	throw new Error(`unclosed CREATE TABLE ${tableName}`);
}

function splitTopLevel(body: string): string[] {
	const parts: string[] = [];
	let current = "";
	let depth = 0;

	for (const character of body) {
		if (character === "(") {
			depth += 1;
		} else if (character === ")") {
			depth -= 1;
		}

		if (character === "," && depth === 0) {
			parts.push(current.trim());
			current = "";
			continue;
		}

		current += character;
	}

	if (current.trim()) {
		parts.push(current.trim());
	}

	return parts.filter(Boolean);
}

function columnMap(body: string): Map<string, string> {
	const columns = new Map<string, string>();

	for (const part of splitTopLevel(body)) {
		if (/^(FOREIGN KEY|PRIMARY KEY|UNIQUE|CHECK)\b/iu.test(part)) {
			continue;
		}

		const name = part.split(/\s+/u)[0]?.replaceAll(/["`]/gu, "").toLowerCase();
		if (name) {
			columns.set(name, part);
		}
	}

	return columns;
}

describe("MCQ schema contract (migration 0002)", () => {
	it("creates mcqs with id, name, question, created_by_user_id, and timestamps", () => {
		const sql = readMigration0002();
		const columns = columnMap(tableBody(sql, "mcqs"));

		expect([...columns.keys()]).toEqual([
			"id",
			"name",
			"question",
			"created_by_user_id",
			"created_at",
			"updated_at",
		]);
		expect(columns.get("name")).toMatch(/TEXT NOT NULL/u);
		expect(columns.get("question")).toMatch(/TEXT NOT NULL/u);
		expect(columns.get("created_by_user_id")).toMatch(/TEXT NOT NULL/u);
		expect(columns.has("description")).toBe(false);
	});

	it("references users.id from mcqs.created_by_user_id", () => {
		const body = tableBody(readMigration0002(), "mcqs");
		expect(body).toMatch(
			/FOREIGN KEY\s*\(\s*created_by_user_id\s*\)\s*REFERENCES\s+users\s*\(\s*id\s*\)/iu,
		);
	});

	it("creates mcq_choices with a cascaded foreign key to mcqs", () => {
		const sql = readMigration0002();
		const columns = columnMap(tableBody(sql, "mcq_choices"));

		expect(columns.has("id")).toBe(true);
		expect(columns.get("mcq_id")).toMatch(/TEXT NOT NULL/u);
		expect(columns.get("label")).toMatch(/TEXT NOT NULL/u);
		expect(columns.get("is_correct")).toMatch(/INTEGER NOT NULL/u);
		expect(columns.get("is_correct")).toMatch(/CHECK\s*\(\s*is_correct\s+IN\s*\(\s*0\s*,\s*1\s*\)\s*\)/iu);
		expect(columns.get("position")).toMatch(/INTEGER NOT NULL/u);
		expect(tableBody(sql, "mcq_choices")).toMatch(
			/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)\s*ON DELETE CASCADE/iu,
		);
	});

	it("creates mcq_attempts that snapshot correctness and cascade on delete", () => {
		const sql = readMigration0002();
		const body = tableBody(sql, "mcq_attempts");
		const columns = columnMap(body);

		expect(columns.has("id")).toBe(true);
		expect(columns.get("mcq_id")).toMatch(/TEXT NOT NULL/u);
		expect(columns.get("choice_id")).toMatch(/TEXT NOT NULL/u);
		expect(columns.get("is_correct")).toMatch(/INTEGER NOT NULL/u);
		expect(columns.get("is_correct")).toMatch(/CHECK\s*\(\s*is_correct\s+IN\s*\(\s*0\s*,\s*1\s*\)\s*\)/iu);
		expect(columns.has("updated_at")).toBe(false);
		expect(body).toMatch(
			/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)\s*ON DELETE CASCADE/iu,
		);
		expect(body).toMatch(
			/FOREIGN KEY\s*\(\s*choice_id\s*\)\s*REFERENCES\s+mcq_choices\s*\(\s*id\s*\)\s*ON DELETE CASCADE/iu,
		);
	});

	it("indexes foreign keys used for lookups", () => {
		const sql = readMigration0002();
		expect(sql).toMatch(/CREATE INDEX idx_mcqs_created_by_user_id ON mcqs\s*\(\s*created_by_user_id\s*\)/iu);
		expect(sql).toMatch(/CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices\s*\(\s*mcq_id\s*\)/iu);
		expect(sql).toMatch(/CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts\s*\(\s*mcq_id\s*\)/iu);
		expect(sql).toMatch(/CREATE INDEX idx_mcq_attempts_choice_id ON mcq_attempts\s*\(\s*choice_id\s*\)/iu);
	});
});
