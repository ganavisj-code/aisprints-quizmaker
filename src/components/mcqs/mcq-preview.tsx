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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type PreviewChoice = {
	id: string;
	label: string;
};

type LoadedMcq = {
	id: string;
	name: string;
	question: string;
	choices: PreviewChoice[];
};

type McqPreviewProps = {
	mcqId: string;
};

export function McqPreview({ mcqId }: McqPreviewProps) {
	const router = useRouter();
	const [mcq, setMcq] = useState<LoadedMcq | null>(null);
	const [selectedChoiceId, setSelectedChoiceId] = useState("");
	const [result, setResult] = useState<"correct" | "incorrect" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
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
					setMcq({
						id: body.id,
						name: body.name,
						question: body.question,
						choices: body.choices.map((choice) => ({ id: choice.id, label: choice.label })),
					});
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

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		if (!selectedChoiceId) {
			setError("Select a choice.");
			return;
		}

		setPending(true);
		try {
			const response = await fetch(`/api/mcqs/${mcqId}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ choiceId: selectedChoiceId }),
			});

			if (response.status !== 201) {
				const body = (await response.json()) as { error?: string };
				setError(body.error ?? "Unable to record attempt.");
				return;
			}

			const body = (await response.json()) as { isCorrect?: boolean };
			setResult(body.isCorrect ? "correct" : "incorrect");
		} catch {
			setError("Unable to record attempt.");
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

	if (!mcq) {
		return (
			<div className="flex flex-col gap-4">
				{error ? <FieldError>{error}</FieldError> : null}
				<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
					Back to test bank
				</Button>
			</div>
		);
	}

	return (
		<form className="flex w-full flex-col gap-6" onSubmit={onSubmit}>
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="font-heading text-2xl font-medium">{mcq.name}</h1>
				<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
					Back to test bank
				</Button>
			</div>

			<p className="text-lg">{mcq.question}</p>

			<FieldGroup>
				<FieldSet>
					<FieldLegend>Choices</FieldLegend>
					<RadioGroup value={selectedChoiceId} onValueChange={setSelectedChoiceId}>
						{mcq.choices.map((choice) => (
							<Field key={choice.id} orientation="horizontal">
								<RadioGroupItem value={choice.id} id={`preview-choice-${choice.id}`} />
								<FieldLabel htmlFor={`preview-choice-${choice.id}`}>{choice.label}</FieldLabel>
							</Field>
						))}
					</RadioGroup>
				</FieldSet>

				{error ? <FieldError>{error}</FieldError> : null}

				{result === "correct" ? (
					<p role="status">Your answer is correct.</p>
				) : null}
				{result === "incorrect" ? (
					<p role="status">Your answer is incorrect.</p>
				) : null}

				<Field>
					<Button type="submit" disabled={pending}>
						Submit
					</Button>
				</Field>
			</FieldGroup>
		</form>
	);
}
