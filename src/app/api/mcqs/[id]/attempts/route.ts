import { createAttemptSchema } from "@/lib/mcq-schemas";
import { createAttempt } from "@/lib/services/attempt-service";
import { McqNotFoundError } from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const parsed = createAttemptSchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Validation failed" }, { status: 400 });
	}

	try {
		const { id } = await context.params;
		const attempt = await createAttempt(id, parsed.data.choiceId);
		return Response.json(attempt, { status: 201 });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return Response.json({ error: error.message }, { status: 404 });
		}

		return Response.json({ error: "Server error" }, { status: 500 });
	}
}
