import { describe, expect, it } from "vitest";

import { hashPassword } from "./password";

describe("hashPassword", () => {
	it("returns a value different from the plaintext", async () => {
		const plaintext = "teacher-password";
		const hashed = await hashPassword(plaintext);

		expect(hashed).not.toBe(plaintext);
		expect(hashed.length).toBeGreaterThan(0);
	});

	it("hashes the same plaintext to the same value so login can compare", async () => {
		const plaintext = "teacher-password";

		await expect(hashPassword(plaintext)).resolves.toBe(await hashPassword(plaintext));
	});

	it("does not hash different plaintext values to the same value", async () => {
		await expect(hashPassword("teacher-password")).resolves.not.toBe(
			await hashPassword("other-password"),
		);
	});
});
