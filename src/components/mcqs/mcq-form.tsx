"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { readStoredUserId } from "@/lib/user-id-storage";

type DraftChoice = {
	key: string;
	id?: string;
	label: string;
	isCorrect: boolean;
};

type LoadedMcq = {
	id: string;
	name: string;
	question: string;
	choices: { id: string; label: string; isCorrect: boolean }[];
};

type McqFormProps = {
	mcqId?: string;
};

function newChoice(): DraftChoice {
	return { key: crypto.randomUUID(), label: "", isCorrect: false };
}

export function McqForm({ mcqId }: McqFormProps) {
	const router = useRouter();
	const isEdit = Boolean(mcqId);
	const [name, setName] = useState("");
	const [question, setQuestion] = useState("");
	const [choices, setChoices] = useState<DraftChoice[]>(() => [newChoice(), newChoice()]);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [loading, setLoading] = useState(isEdit);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		if (!mcqId) {
			return;
		}

		let cancelled = false;

		async function load() {
			setError(null);
			setNotFound(false);
			setLoading(true);
			try {
				const response = await fetch(`/api/mcqs/${mcqId}`);
				if (response.status === 404) {
					if (!cancelled) {
						setNotFound(true);
					}
					return;
				}
				if (!response.ok) {
					throw new Error("Failed to load question");
				}
				const body = (await response.json()) as LoadedMcq;
				if (!cancelled) {
					setName(body.name);
					setQuestion(body.question);
					setChoices(
						body.choices.map((choice) => ({
							key: choice.id,
							id: choice.id,
							label: choice.label,
							isCorrect: choice.isCorrect,
						})),
					);
				}
			} catch {
				if (!cancelled) {
					setError("Could not load question.");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [mcqId]);

	function addChoice() {
		setChoices((current) => (current.length >= 6 ? current : [...current, newChoice()]));
	}

	function removeChoice(key: string) {
		setChoices((current) => (current.length <= 2 ? current : current.filter((choice) => choice.key !== key)));
	}

	function clientError(): string | null {
		if (!name.trim()) {
			return "Name is required.";
		}
		if (!question.trim()) {
			return "Question is required.";
		}
		if (choices.some((choice) => !choice.label.trim())) {
			return "Every choice needs a label.";
		}
		if (choices.filter((choice) => choice.isCorrect).length !== 1) {
			return "Mark one choice as the correct answer.";
		}
		return null;
	}

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const validationError = clientError();
		if (validationError) {
			setError(validationError);
			return;
		}

		const createdByUserId = readStoredUserId();
		if (!isEdit && !createdByUserId) {
			setError("Sign in to create a question.");
			return;
		}

		setPending(true);
		try {
			const payloadChoices = choices.map((choice) =>
				choice.id
					? { id: choice.id, label: choice.label.trim(), isCorrect: choice.isCorrect }
					: { label: choice.label.trim(), isCorrect: choice.isCorrect },
			);

			const response = await fetch(isEdit ? `/api/mcqs/${mcqId}` : "/api/mcqs", {
				method: isEdit ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					isEdit
						? { name: name.trim(), question: question.trim(), choices: payloadChoices }
						: {
								name: name.trim(),
								question: question.trim(),
								createdByUserId,
								choices: payloadChoices,
							},
				),
			});

			if (response.status === 200 || response.status === 201) {
				router.push("/mcqs");
				return;
			}

			const body = (await response.json()) as { error?: string };
			setError(body.error ?? "Unable to save question.");
		} catch {
			setError("Unable to save question.");
		} finally {
			setPending(false);
		}
	}

	if (notFound) {
		return (
			<div className="flex flex-col gap-4">
				<p>Question not found.</p>
				<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
					Back to test bank
				</Button>
			</div>
		);
	}

	if (loading) {
		return <p className="text-muted-foreground">Loading question…</p>;
	}

	const correctKey = choices.find((choice) => choice.isCorrect)?.key ?? "";

	return (
		<form className="flex w-full flex-col gap-6" onSubmit={onSubmit}>
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="font-heading text-2xl font-medium">
					{isEdit ? "Edit question" : "Create question"}
				</h1>
			</div>

			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="name">Name</FieldLabel>
					<Input
						id="name"
						name="name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						autoComplete="off"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="question">Question</FieldLabel>
					<Textarea
						id="question"
						name="question"
						value={question}
						onChange={(event) => setQuestion(event.target.value)}
						rows={4}
					/>
				</Field>

				<FieldSet>
					<FieldLegend>Choices</FieldLegend>
					<RadioGroup
						value={correctKey}
						onValueChange={(key) => {
							setChoices((current) =>
								current.map((choice) => ({ ...choice, isCorrect: choice.key === key })),
							);
						}}
					>
						{choices.map((choice, index) => (
							<div key={choice.key} className="flex flex-wrap items-end gap-2">
								<Field className="min-w-48 flex-1">
									<FieldLabel htmlFor={`choice-${index}-label`}>Choice {index + 1}</FieldLabel>
									<Input
										id={`choice-${index}-label`}
										value={choice.label}
										onChange={(event) => {
											const label = event.target.value;
											setChoices((current) =>
												current.map((item) =>
													item.key === choice.key ? { ...item, label } : item,
												),
											);
										}}
									/>
								</Field>
								<RadioGroupItem
									value={choice.key}
									id={`choice-${index}-correct`}
									aria-label={`Mark choice ${index + 1} as correct`}
								/>
								<Button
									type="button"
									variant="outline"
									aria-label={`Remove choice ${index + 1}`}
									disabled={choices.length <= 2}
									onClick={() => removeChoice(choice.key)}
								>
									Remove
								</Button>
							</div>
						))}
					</RadioGroup>
					<Button type="button" variant="outline" onClick={addChoice} disabled={choices.length >= 6}>
						Add choice
					</Button>
				</FieldSet>

				{error ? <FieldError>{error}</FieldError> : null}

				<Field orientation="horizontal">
					<Button type="submit" disabled={pending}>
						Save
					</Button>
					<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
						Cancel
					</Button>
				</Field>
			</FieldGroup>
		</form>
	);
}
