export const USER_ID_STORAGE_KEY = "userId";

export function readStoredUserId(): string | null {
	return sessionStorage.getItem(USER_ID_STORAGE_KEY);
}

export function storeUserId(id: string): void {
	sessionStorage.setItem(USER_ID_STORAGE_KEY, id);
}

export function clearStoredUserId(): void {
	sessionStorage.removeItem(USER_ID_STORAGE_KEY);
}
