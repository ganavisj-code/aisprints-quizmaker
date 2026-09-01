import { z } from "zod";

export const registerSchema = z.object({
	firstName: z.string().trim().min(1),
	lastName: z.string().trim().min(1),
	username: z.string().trim().min(1),
	email: z.email(),
	password: z.string().min(1),
});

export const loginSchema = z.object({
	username: z.string().trim().min(1),
	password: z.string().min(1),
});
