import { createMcqSchema } from "@/lib/mcq-schemas";
import { create, list, McqValidationError } from "@/lib/services/mcq-service";

export async function GET(_request: Request) {
	try {
		const mcqs = await list();
		return Response.json({ mcqs }, { status: 200 });
	} catch {
		return Response.json({ error: "Server error" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const parsed = createMcqSchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Validation failed" }, { status: 400 });
	}

	try {
		const mcq = await create(parsed.data);
		return Response.json(mcq, { status: 201 });
	} catch (error) {
		if (error instanceof McqValidationError) {
			return Response.json({ error: error.message }, { status: 400 });
		}

		return Response.json({ error: "Server error" }, { status: 500 });
	}
}
