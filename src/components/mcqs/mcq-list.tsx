"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { McqRowActions } from "@/components/mcqs/mcq-row-actions";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type McqListItem = {
	id: string;
	name: string;
	question: string;
};

export function McqList() {
	const router = useRouter();
	const [mcqs, setMcqs] = useState<McqListItem[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState(0);

	const reload = useCallback(() => {
		setReloadToken((token) => token + 1);
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setError(null);
			try {
				const response = await fetch("/api/mcqs");
				if (!response.ok) {
					throw new Error("Failed to load questions");
				}
				const body = (await response.json()) as { mcqs?: McqListItem[] };
				if (!cancelled) {
					setMcqs(body.mcqs ?? []);
				}
			} catch {
				if (!cancelled) {
					setError("Could not load questions.");
					setMcqs([]);
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [reloadToken]);

	return (
		<div className="flex w-full flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="font-heading text-2xl font-medium">Test bank</h1>
				<div className="flex items-center gap-2">
					<Button type="button" onClick={() => router.push("/mcqs/new")}>
						Create question
					</Button>
					<LogoutButton />
				</div>
			</div>

			{error ? <p className="text-sm text-destructive">{error}</p> : null}

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Question</TableHead>
						<TableHead className="w-16">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{mcqs.length === 0 ? (
						<TableRow>
							<TableCell colSpan={3} className="text-muted-foreground">
								No questions yet.
							</TableCell>
						</TableRow>
					) : (
						mcqs.map((mcq) => (
							<TableRow key={mcq.id}>
								<TableCell className="font-medium">{mcq.name}</TableCell>
								<TableCell className="max-w-xl whitespace-normal text-muted-foreground">
									{mcq.question}
								</TableCell>
								<TableCell>
									<McqRowActions id={mcq.id} name={mcq.name} onDeleted={reload} />
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
