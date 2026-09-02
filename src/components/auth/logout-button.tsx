"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function onClick() {
		setPending(true);
		try {
			await fetch("/api/logout", { method: "POST" });
		} finally {
			router.push("/login");
			setPending(false);
		}
	}

	return (
		<Button type="button" variant="outline" onClick={onClick} disabled={pending}>
			Log out
		</Button>
	);
}
