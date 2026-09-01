import { registerSchema } from "@/lib/auth-schemas";
import { create, UserConflictError } from "@/lib/services/user-service";

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const parsed = registerSchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Validation failed" }, { status: 400 });
	}

	try {
		const user = await create({
			firstName: parsed.data.firstName,
			lastName: parsed.data.lastName,
			username: parsed.data.username,
			email: parsed.data.email,
			passwordHash: parsed.data.password,
		});

		return Response.json(user, { status: 201 });
	} catch (error) {
		if (error instanceof UserConflictError) {
			return Response.json({ error: error.message }, { status: 409 });
		}

		return Response.json({ error: "Server error" }, { status: 500 });
	}
}
