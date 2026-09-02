"use client";

import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type McqRowActionsProps = {
	id: string;
	name: string;
	onDeleted: () => void;
};

export function McqRowActions({ id, name, onDeleted }: McqRowActionsProps) {
	const router = useRouter();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [pending, setPending] = useState(false);

	async function confirmDelete() {
		setPending(true);
		try {
			const response = await fetch(`/api/mcqs/${id}`, { method: "DELETE" });
			if (!response.ok) {
				return;
			}
			setDeleteOpen(false);
			onDeleted();
		} finally {
			setPending(false);
		}
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
					aria-label={`Actions for ${name}`}
				>
					<EllipsisVertical />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => router.push(`/mcqs/${id}/edit`)}>
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => router.push(`/mcqs/${id}/preview`)}>
						Preview
					</DropdownMenuItem>
					<DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete question?</DialogTitle>
						<DialogDescription>
							This will permanently delete “{name}” and its choices and attempts.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={confirmDelete}
							disabled={pending}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
