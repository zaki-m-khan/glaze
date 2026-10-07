import type { Status } from "@/lib/record";

const LABEL: Record<Status, string> = { green: "Good", amber: "Watch", red: "Needs a look" };

export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip ${status}`}>{LABEL[status]}</span>;
}
