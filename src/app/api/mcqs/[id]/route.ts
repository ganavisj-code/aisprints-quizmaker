import { updateMcqSchema } from "@/lib/mcq-schemas";
import {
	deleteMcq,
	findById,
	McqNotFoundError,
	McqValidationError,
	update,
} from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { id } = await context.params;
		const mcq = await findById(id);

		if (!mcq) {
			return Response.json({ error: "MCQ not found" }, { status: 404 });
		}

		return Response.json(mcq, { status: 200 });
	} catch {
		return Response.json({ error: "Server error" }, { status: 500 });
	}
}

export async function PUT(request: Request, context: RouteContext) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const parsed = updateMcqSchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Validation failed" }, { status: 400 });
	}

	try {
		const { id } = await context.params;
		const mcq = await update(id, parsed.data);
		return Response.json(mcq, { status: 200 });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return Response.json({ error: error.message }, { status: 404 });
		}

		if (error instanceof McqValidationError) {
			return Response.json({ error: error.message }, { status: 400 });
		}

		return Response.json({ error: "Server error" }, { status: 500 });
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	try {
		const { id } = await context.params;
		await deleteMcq(id);
		return new Response(null, { status: 204 });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return Response.json({ error: error.message }, { status: 404 });
		}

		return Response.json({ error: "Server error" }, { status: 500 });
	}
}
