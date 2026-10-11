/** Success or error line under an account form. */
export default function FormMessage({ message }: { message: { kind: "ok" | "error"; text: string } | null }) {
  if (!message) return null;
  return message.kind === "ok" ? (
    <p role="status" className="text-sm text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/40 rounded-lg px-3 py-2">
      {message.text}
    </p>
  ) : (
    <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
      {message.text}
    </p>
  );
}
