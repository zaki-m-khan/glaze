import type { Status } from "@/lib/record";

const LABEL: Record<Status, string> = { green: "On target", amber: "Watch", red: "Below target" };

export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip ${status}`}>{LABEL[status]}</span>;
}
