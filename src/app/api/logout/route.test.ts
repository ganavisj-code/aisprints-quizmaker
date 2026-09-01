import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/logout", () => {
	it("returns 200 with { ok: true }", async () => {
		const response = await POST(
			new Request("http://localhost/api/logout", { method: "POST" }),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ ok: true });
	});
});
