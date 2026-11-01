import { AppendForm, DeleteForm, ReconcileForm } from "@/components/op-forms";
import { RequireConnection } from "@/components/require-connection";
import { Panel } from "@/components/ui/panel";

export const metadata = { title: "Operations · Stratus" };

export default function OperationsPage() {
  return (
    <RequireConnection>
    <main className="flex flex-1 flex-wrap items-stretch gap-4">
      <Panel title="APPEND" border="magenta" titleTone="cyan" className="flex min-w-[min(100%,520px)] flex-[999_1_520px] flex-col gap-4 px-4">
        <div className="flex flex-col gap-4">
          <AppendForm />
        </div>
      </Panel>

      <div className="flex min-w-[min(100%,340px)] flex-[1_1_340px] flex-col gap-4 self-stretch">
        <Panel title="RECONCILE" className="flex-1 px-4">
          <div className="flex flex-col gap-3">
            <ReconcileForm />
          </div>
        </Panel>
        <Panel title="DELETE" border="red" titleTone="red" className="flex-1 px-4">
          <div className="flex flex-col gap-3">
            <DeleteForm />
          </div>
        </Panel>
      </div>
    </main>
    </RequireConnection>
  );
}
