"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { clearStoredUserId } from "@/lib/user-id-storage";

export function LogoutButton() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function onClick() {
		setPending(true);
		try {
			await fetch("/api/logout", { method: "POST" });
		} finally {
			clearStoredUserId();
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
