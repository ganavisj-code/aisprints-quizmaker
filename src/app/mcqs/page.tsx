import { McqList } from "@/components/mcqs/mcq-list";

export default function Page() {
	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col p-6 md:p-10">
			<McqList />
		</div>
	);
}
