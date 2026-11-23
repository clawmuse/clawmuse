import { useCallback } from "react";
import { useOptionalClawMuseAccountModel } from "@/clawmuse/account-provider";
import { type HostOrderDrop, useHostOrderStore } from "./host-order";

export function useReorderHosts(): (drop: HostOrderDrop) => void {
  const accountModel = useOptionalClawMuseAccountModel();
  return useCallback(
    (drop: HostOrderDrop) => {
      const next = useHostOrderStore.getState().arrangeHosts(drop);
      void accountModel?.reorderHosts(next);
    },
    [accountModel],
  );
}
