import { RecordsView } from "@/components/records-view";
import { RequireConnection } from "@/components/require-connection";

export default function RecordsPage() {
  return (
    <RequireConnection>
      <RecordsView />
    </RequireConnection>
  );
}
