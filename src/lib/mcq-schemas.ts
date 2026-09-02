import { z } from "zod";

const choiceInputSchema = z.object({
	id: z.string().trim().min(1).optional(),
	label: z.string().trim().min(1),
	isCorrect: z.boolean(),
});

const choicesSchema = z
	.array(choiceInputSchema)
	.min(2)
	.max(6)
	.refine((choices) => choices.filter((choice) => choice.isCorrect).length === 1, {
		message: "Exactly one choice must be correct",
	});

export const createMcqSchema = z.object({
	name: z.string().trim().min(1),
	question: z.string().trim().min(1),
	createdByUserId: z.string().trim().min(1),
	choices: choicesSchema,
});

export const updateMcqSchema = z.object({
	name: z.string().trim().min(1),
	question: z.string().trim().min(1),
	choices: choicesSchema,
});

export const createAttemptSchema = z.object({
	choiceId: z.string().trim().min(1),
});
