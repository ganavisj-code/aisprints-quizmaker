import { loginSchema } from "@/lib/auth-schemas";
import { findByUsername } from "@/lib/services/user-service";

const invalidCredentials = { error: "Invalid username or password" };

export async function POST(request: Request) {
	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const parsed = loginSchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Validation failed" }, { status: 400 });
	}

	try {
		const user = await findByUsername(parsed.data.username);
		if (!user || user.passwordHash !== parsed.data.password) {
			return Response.json(invalidCredentials, { status: 401 });
		}

		const { passwordHash: _passwordHash, ...publicUser } = user;
		return Response.json(publicUser, { status: 200 });
	} catch {
		return Response.json({ error: "Server error" }, { status: 500 });
	}
}
