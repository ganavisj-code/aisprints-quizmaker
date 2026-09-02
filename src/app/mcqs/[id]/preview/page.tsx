import { McqPreview } from "@/components/mcqs/mcq-preview";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col p-6 md:p-10">
			<McqPreview mcqId={id} />
		</div>
	);
}
